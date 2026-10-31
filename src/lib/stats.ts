import type { Category, RoomInfo } from './state.svelte';
import {
  DAY_MS,
  doneList,
  frequencyDays,
  groupStatus,
  pointsOf,
  type GroupStatus,
  type Task,
} from './tasks';
import { startOfDay } from './today';

/* The numbers behind the Stats tab. Pure functions of the tasks and the time. */

const HOUR_MS = 3_600_000;
/** A repeat counts as on time if done within 10% of its interval, plus 6 hours. */
const ON_TIME_SLACK = 1.1;
const ON_TIME_GRACE_MS = 6 * HOUR_MS;
const ON_TIME_WINDOW_DAYS = 90;
const RECENT_DAYS = 30;
export const CHART_WEEKS = 12;
export const HEATMAP_WEEKS = 18;
const MOST_LATE_SHOWN = 6;

/** Monday 00:00 of the week containing `time`. */
export function startOfWeek(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return date.getTime();
}

export const shortDate = (time: number): string =>
  new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

interface Completion {
  time: number;
  task: Task;
}

function completions(tasks: Task[]): Completion[] {
  return tasks.flatMap((task) => doneList(task).map((time) => ({ time, task })));
}

const sumPoints = (list: Completion[]): number =>
  list.reduce((sum, entry) => sum + pointsOf(entry.task), 0);

export interface Summary {
  thisWeek: number;
  thisWeekCount: number;
  lastWeek: number;
  last30: number;
  last30Count: number;
  /** share of repeats done on time in the last 90 days; null if none yet */
  onTimePercent: number | null;
  overdue: GroupStatus;
}

export interface LateTask {
  task: Task;
  repeats: number;
  late: number;
  /** average gap as a multiple of the interval */
  averageRatio: number;
}

export function summary(tasks: Task[], visible: Task[], now: number): Summary {
  const all = completions(tasks);
  const weekStart = startOfWeek(now);
  const thisWeekList = all.filter((entry) => entry.time >= weekStart);
  const lastWeekList = all.filter(
    (entry) => entry.time >= weekStart - 7 * DAY_MS && entry.time < weekStart,
  );
  const last30List = all.filter((entry) => entry.time >= now - RECENT_DAYS * DAY_MS);
  const { intervals, onTime } = repeatTimeliness(tasks, now);
  return {
    thisWeek: sumPoints(thisWeekList),
    thisWeekCount: thisWeekList.length,
    lastWeek: sumPoints(lastWeekList),
    last30: sumPoints(last30List),
    last30Count: last30List.length,
    onTimePercent: intervals ? Math.round((onTime / intervals) * 100) : null,
    overdue: groupStatus(visible, now),
  };
}

function isOnTime(gap: number, intervalMs: number): boolean {
  return gap <= intervalMs * ON_TIME_SLACK + ON_TIME_GRACE_MS;
}

function repeatTimeliness(tasks: Task[], now: number): { intervals: number; onTime: number } {
  let intervals = 0;
  let onTime = 0;
  for (const task of tasks) {
    const done = doneList(task);
    const intervalMs = frequencyDays(task) * DAY_MS;
    for (let i = 1; i < done.length; i++) {
      if (done[i] >= now - ON_TIME_WINDOW_DAYS * DAY_MS) {
        intervals++;
        if (isOnTime(done[i] - done[i - 1], intervalMs)) {
          onTime++;
        }
      }
    }
  }
  return { intervals, onTime };
}

/** Tasks most often done late (at least two repeats), worst first. */
export function mostOftenLate(tasks: Task[]): LateTask[] {
  const result: LateTask[] = [];
  for (const task of tasks) {
    const done = doneList(task);
    const intervalMs = frequencyDays(task) * DAY_MS;
    let repeats = 0;
    let late = 0;
    let ratioSum = 0;
    for (let i = 1; i < done.length; i++) {
      const gap = done[i] - done[i - 1];
      repeats++;
      ratioSum += gap / intervalMs;
      if (!isOnTime(gap, intervalMs)) {
        late++;
      }
    }
    if (repeats >= 2 && late > 0) {
      result.push({ task, repeats, late, averageRatio: ratioSum / repeats });
    }
  }
  return result
    .sort((a, b) => b.late / b.repeats - a.late / a.repeats || b.averageRatio - a.averageRatio)
    .slice(0, MOST_LATE_SHOWN);
}

export interface WeekBar {
  start: number;
  points: number;
}

/** Points per week, oldest first, ending with this week. */
export function weeklyPoints(tasks: Task[], now: number): WeekBar[] {
  const all = completions(tasks);
  const weekStart = startOfWeek(now);
  const weeks: WeekBar[] = [];
  for (let i = CHART_WEEKS - 1; i >= 0; i--) {
    const start = weekStart - i * 7 * DAY_MS;
    const inWeek = all.filter((entry) => entry.time >= start && entry.time < start + 7 * DAY_MS);
    weeks.push({ start, points: sumPoints(inWeek) });
  }
  return weeks;
}

/** A tidy axis: step between grid lines and the top value. */
export function axisFor(max: number): { step: number; top: number } {
  let step: number;
  if (max <= 8) {
    step = 2;
  } else if (max <= 20) {
    step = 5;
  } else if (max <= 50) {
    step = 10;
  } else {
    step = Math.ceil(max / 40) * 10;
  }
  return { step, top: Math.ceil(max / step) * step };
}

export interface HeatCell {
  week: number;
  weekday: number;
  day: number;
  count: number;
  /** 0 (none) … 4 (many) */
  level: number;
}

function heatLevel(count: number): number {
  if (count === 0) {
    return 0;
  }
  if (count <= 2) {
    return 1;
  }
  if (count <= 4) {
    return 2;
  }
  return count <= 7 ? 3 : 4;
}

/** Tasks done per day for the last HEATMAP_WEEKS weeks, Monday-first columns. */
export function heatmap(tasks: Task[], now: number): HeatCell[] {
  const perDay = new Map<number, number>();
  for (const entry of completions(tasks)) {
    const day = startOfDay(entry.time);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const first = startOfWeek(now) - (HEATMAP_WEEKS - 1) * 7 * DAY_MS;
  const cells: HeatCell[] = [];
  for (let week = 0; week < HEATMAP_WEEKS; week++) {
    for (let weekday = 0; weekday < 7; weekday++) {
      /* 3 h in, so a daylight-saving change cannot land on the wrong day */
      const day = startOfDay(first + (week * 7 + weekday) * DAY_MS + 3 * HOUR_MS);
      if (day > now) {
        continue;
      }
      const count = perDay.get(day) ?? 0;
      cells.push({ week, weekday, day, count, level: heatLevel(count) });
    }
  }
  return cells;
}

export interface MatrixCell {
  room: RoomInfo;
  group: GroupStatus | null;
}

/** For each category that has tasks: one cell per room. */
export function roomCategoryMatrix(
  tasks: Task[],
  categories: Category[],
  rooms: RoomInfo[],
  now: number,
): Array<{ category: Category; cells: MatrixCell[] }> {
  return categories
    .filter((category) => tasks.some((task) => task.cat === category.id))
    .map((category) => ({
      category,
      cells: rooms.map((room) => {
        const list = tasks.filter((task) => task.cat === category.id && task.room === room.id);
        return { room, group: list.length ? groupStatus(list, now) : null };
      }),
    }));
}

/** Points per category over the last 30 days, biggest first. */
export function pointsByCategory(
  tasks: Task[],
  categories: Category[],
  now: number,
): Array<{ category: Category; points: number }> {
  const recent = completions(tasks).filter((entry) => entry.time >= now - RECENT_DAYS * DAY_MS);
  return categories
    .map((category) => ({
      category,
      points: sumPoints(recent.filter((entry) => entry.task.cat === category.id)),
    }))
    .sort((a, b) => b.points - a.points);
}
