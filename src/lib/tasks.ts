/* Task maths: how often a task repeats, when it falls due, how late it is,
   and how a group of tasks is doing. Pure functions — no saving, no screen. */

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAYS_PER_MONTH = 30.44;
const DAYS_PER_YEAR = 365.25;

/** How often, as saved: `every` units — or, for 'y', `every` times a year. */
export type FrequencyUnit = 'd' | 'w' | 'm' | 'y';

/** A task as saved in the database (collection 'tasks'). */
export interface Task {
  id: string;
  name: string;
  /** a room id from the floor plan, or 'home' for the whole home */
  room: string;
  /** a category id */
  cat: string;
  every: number;
  unit: FrequencyUnit;
  /** effort points, one of POINT_VALUES; missing means DEFAULT_POINTS */
  pts?: number;
  /** completion times (ms since 1970), oldest first */
  done?: number[];
  created?: number;
}

/** The effort choices: 1 point is about 5–10 minutes; 0 never uses the day's budget. */
export const POINT_VALUES = [0, 1, 2, 4];
const DEFAULT_POINTS = 2;

/** Due-ness at or above this is "due soon" (amber); at 1 or more it is late. */
export const SOON_THRESHOLD = 0.8;

export type Status = 'new' | 'late' | 'soon' | 'ok';
export type GroupStatusName = Status | 'none';

export function frequencyDays(task: Pick<Task, 'every' | 'unit'>): number {
  const count = Math.max(0.1, Number(task.every) || 1);
  switch (task.unit) {
    case 'w':
      return 7 * count;
    case 'm':
      return DAYS_PER_MONTH * count;
    case 'y':
      return DAYS_PER_YEAR / count;
    default:
      return count;
  }
}

export function frequencyLabel(task: Pick<Task, 'every' | 'unit'>): string {
  const count = Number(task.every) || 1;
  switch (task.unit) {
    case 'w':
      return count === 1 ? 'weekly' : `every ${count} weeks`;
    case 'm':
      return count === 1 ? 'monthly' : `every ${count} months`;
    case 'y':
      if (count === 1) {
        return 'once a year';
      }
      return count === 2 ? 'twice a year' : `${count} times a year`;
    default:
      return count === 1 ? 'daily' : `every ${count} days`;
  }
}

/** Completion times, sorted, ignoring anything that is not a number. */
export function doneList(task: Task): number[] {
  return Array.isArray(task.done)
    ? task.done.filter((time) => typeof time === 'number').sort((a, b) => a - b)
    : [];
}

export function lastDone(task: Task): number | null {
  const done = doneList(task);
  return done.length ? done[done.length - 1] : null;
}

/** How far through its interval a task is: 0 just done, 1 due now, 2 twice as late. */
export function urgency(task: Task, now: number): number {
  const last = lastDone(task);
  return last === null ? 1 : (now - last) / (frequencyDays(task) * DAY_MS);
}

function statusOfUrgency(value: number): 'late' | 'soon' | 'ok' {
  if (value >= 1) {
    return 'late';
  }
  return value >= SOON_THRESHOLD ? 'soon' : 'ok';
}

export function pointsOf(task: Task): number {
  const points = Number(task.pts);
  return POINT_VALUES.includes(points) ? points : DEFAULT_POINTS;
}

export const isNew = (task: Task): boolean => doneList(task).length === 0;

export function statusFor(task: Task, now: number): Status {
  return isNew(task) ? 'new' : statusOfUrgency(urgency(task, now));
}

/** For ordering lists: never-done tasks last, then the most overdue first. */
export function sortKey(task: Task, now: number): number {
  return isNew(task) ? -1 : urgency(task, now);
}

/** A rough, short duration: "5 min", "3 h", "12 d", "4 mo", "1.5 yr". */
export function duration(ms: number): string {
  const hours = ms / HOUR_MS;
  const days = ms / DAY_MS;
  if (hours < 1) {
    return `${Math.max(1, Math.round(ms / MINUTE_MS))} min`;
  }
  if (hours < 24) {
    return `${Math.round(hours)} h`;
  }
  if (days < 60) {
    return `${Math.round(days)} d`;
  }
  if (days < 730) {
    return `${Math.round(days / DAYS_PER_MONTH)} mo`;
  }
  return `${(days / DAYS_PER_YEAR).toFixed(1)} yr`;
}

export function ago(time: number, now: number): string {
  const ms = now - time;
  return ms < MINUTE_MS ? 'just now' : `${duration(ms)} ago`;
}

export function dueText(task: Task, now: number): string {
  const last = lastDone(task);
  if (last === null) {
    return 'Never done';
  }
  const remaining = frequencyDays(task) * DAY_MS - (now - last);
  return remaining < 0
    ? `${duration(-remaining)} late · done ${ago(last, now)}`
    : `Due in ${duration(remaining)} · done ${ago(last, now)}`;
}

/** Most urgent first; ties go to the more frequent task, then by name. */
export function sortByUrgency(list: Task[], now: number): Task[] {
  return list
    .map((task) => ({ task, key: sortKey(task, now) }))
    .sort(
      (a, b) =>
        b.key - a.key ||
        frequencyDays(a.task) - frequencyDays(b.task) ||
        a.task.name.localeCompare(b.task.name),
    )
    .map((entry) => entry.task);
}

export interface GroupStatus {
  late: number;
  soon: number;
  ok: number;
  new: number;
  total: number;
  /** the worst status in the group, 'none' when empty */
  status: GroupStatusName;
}

export function groupStatus(list: Task[], now: number): GroupStatus {
  const counts = { late: 0, soon: 0, ok: 0, new: 0 };
  for (const task of list) {
    counts[statusFor(task, now)]++;
  }
  let status: GroupStatusName = 'new';
  if (list.length === 0) {
    status = 'none';
  } else if (counts.late) {
    status = 'late';
  } else if (counts.soon) {
    status = 'soon';
  } else if (counts.ok) {
    status = 'ok';
  }
  return { ...counts, total: list.length, status };
}

export function countLabel(group: GroupStatus): string {
  if (!group.total) {
    return 'no tasks';
  }
  if (group.late) {
    return `${group.late} overdue`;
  }
  if (group.soon) {
    return `${group.soon} due soon`;
  }
  return group.ok ? 'all good' : 'not started';
}

/** A readable id from a name plus a random tail: "Wipe the mirror" → "wipe-the-mirror-x7k2p". */
export function makeId(
  name: string,
  maxLength: number,
  randomLength: number,
  fallback = 'item',
): string {
  const stem = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, maxLength)
    .replace(/^-|-$/g, '');
  const tail = Math.random()
    .toString(36)
    .slice(2, 2 + randomLength);
  return `${stem || fallback}-${tail}`;
}

/** Old category ids from earlier versions of the artifact, mapped to today's. */
const RENAMED_CATEGORIES: Record<string, string> = { windows: 'glass', doors: 'surfaces' };

/** Clean up a task as read from the database. */
export function normalizeTask(id: string, data: Partial<Task>): Task | null {
  if (!data.name) {
    return null;
  }
  const task = { ...data, id } as Task;
  const renamed = RENAMED_CATEGORIES[task.cat];
  return renamed ? { ...task, cat: renamed } : task;
}
