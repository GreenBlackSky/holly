import {
  DAY_MS,
  doneList,
  frequencyDays,
  isNew,
  lastDone,
  pointsOf,
  SOON_THRESHOLD,
  urgency,
  type Task,
} from './tasks';

/* Today's list: a handful of tasks picked to fill a points budget, saved
   once a day (document 'today/current') so it does not reshuffle every time
   the app opens. */

/** As saved in 'today/current'. */
export interface TodayPlan {
  /** the local date it was picked for, 'YYYY-MM-DD' */
  date: string;
  /** points to plan for the day */
  budget: number;
  ids: string[];
}

export const DEFAULT_BUDGET = 6;
export const MIN_BUDGET = 1;
export const MAX_BUDGET = 40;

/** Only tasks at least this far through their interval are considered,
    unless nothing is (then all are). */
const NEAR_DUE = 0.35;
/** How much more likely an overdue task is to be picked than a fresh one. */
const OVERDUE_WEIGHT_POWER = 2.5;
const MIN_WEIGHT_URGENCY = 0.05;
/** A task that falls due before midnight is treated as at least this overdue. */
const DUE_TONIGHT_URGENCY = 1.2;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** The local date of a time, as 'YYYY-MM-DD'. */
export function dayKey(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function doneToday(task: Task, now: number): boolean {
  const midnight = startOfDay(now);
  return doneList(task).some((time) => time >= midnight);
}

/** A task that will fall due before midnight belongs to today, even if it was done this morning. */
function dueTonight(task: Task, now: number): boolean {
  const last = lastDone(task);
  return last !== null && last + frequencyDays(task) * DAY_MS <= startOfDay(now) + DAY_MS;
}

/** Pick one item at random, more likely the heavier its weight. */
function weightedPick<T>(list: T[], weight: (item: T) => number): T {
  const weights = list.map(weight);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!(total > 0)) {
    return list[Math.floor(Math.random() * list.length)];
  }
  let remaining = Math.random() * total;
  let index = 0;
  while (index < weights.length - 1) {
    remaining -= weights[index];
    if (remaining <= 0) {
      break;
    }
    index++;
  }
  return list[index];
}

export interface PickOptions {
  /** every task (done-today ones always count toward today) */
  all: Task[];
  /** the tasks the user can see (never-done ones may be hidden) */
  visible: Task[];
  budget: number;
  /** ids to keep in the list no matter what */
  keep: string[];
  now: number;
}

/** Choose today's tasks. The order of random calls matters only for
    reproducing a pick; the rules are what the comments say. */
export function pickToday({ all, visible, budget, keep, now }: PickOptions): string[] {
  const chosen = new Set(keep);
  const byId = new Map(all.map((task) => [task.id, task]));

  /* anything already done today is part of today, and counts against the budget */
  all.filter((task) => doneToday(task, now)).forEach((task) => chosen.add(task.id));
  const pool = visible.filter((task) => !chosen.has(task.id) && !doneToday(task, now));

  /* free tasks (0 points): anything due, or falling due again before midnight */
  pool
    .filter(
      (task) =>
        pointsOf(task) === 0 &&
        (dueTonight(task, now) || urgency(task, now) >= SOON_THRESHOLD || isNew(task)),
    )
    .forEach((task) => chosen.add(task.id));

  let used = [...chosen]
    .map((id) => byId.get(id))
    .filter((task): task is Task => Boolean(task))
    .reduce((sum, task) => sum + pointsOf(task), 0);

  /* tasks with history: weighted by how overdue they are; due tonight counts as due */
  const candidates = pool
    .filter((task) => pointsOf(task) > 0 && !isNew(task) && !chosen.has(task.id))
    .map((task) => ({
      task,
      urgency: dueTonight(task, now)
        ? Math.max(urgency(task, now), DUE_TONIGHT_URGENCY)
        : urgency(task, now),
    }));
  let near = candidates.filter((entry) => entry.urgency >= NEAR_DUE);
  if (!near.length) {
    near = candidates;
  }
  while (used < budget) {
    const fitting = near.filter(
      (entry) => !chosen.has(entry.task.id) && pointsOf(entry.task) <= budget - used,
    );
    if (!fitting.length) {
      break;
    }
    const picked = weightedPick(fitting, (entry) =>
      Math.pow(Math.max(entry.urgency, MIN_WEIGHT_URGENCY), OVERDUE_WEIGHT_POWER),
    );
    chosen.add(picked.task.id);
    used += pointsOf(picked.task);
  }

  /* only once the due work is placed, start at most one never-done task, the most frequent first */
  if (used < budget) {
    const fresh = pool.filter(
      (task) =>
        pointsOf(task) > 0 &&
        isNew(task) &&
        !chosen.has(task.id) &&
        pointsOf(task) <= budget - used,
    );
    if (fresh.length) {
      const task = weightedPick(fresh, (candidate) => 1 / Math.max(1, frequencyDays(candidate)));
      chosen.add(task.id);
    }
  }
  return [...chosen];
}

export function clampBudget(value: number, fallback: number): number {
  return Math.max(MIN_BUDGET, Math.min(MAX_BUDGET, Math.round(value) || fallback));
}
