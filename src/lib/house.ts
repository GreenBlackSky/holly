import { DAY_MS, doneList, pointsOf, type GroupStatusName, type Task } from './tasks';
import { plural } from './text';
import { startOfDay } from './today';

/* The house's own touches: which day it is in the house, the lamps lit in
   its rooms, the keys earned, and the notes the staff leave on Today. Pure
   functions of the tasks and the time; nothing here is saved. */

/** Day 1 is the day of the first task or the first thing done. */
export function dayNumber(tasks: Task[], now: number): number {
  let first = Infinity;
  for (const task of tasks) {
    const done = doneList(task);
    if (done.length) {
      first = Math.min(first, done[0]);
    }
    if (typeof task.created === 'number') {
      first = Math.min(first, task.created);
    }
  }
  if (!Number.isFinite(first) || first > now) {
    return 1;
  }
  /* rounded, so a daylight-saving hour cannot make a day go missing */
  return Math.round((startOfDay(now) - startOfDay(first)) / DAY_MS) + 1;
}

export interface Lamps {
  /** rooms whose tasks are all on track or only due soon */
  lit: number;
  /** rooms on the plan that have tasks at all */
  total: number;
}

/** A room's lamp is lit while none of its tasks is overdue and some have been done. */
export function countLamps(statuses: GroupStatusName[]): Lamps {
  const withTasks = statuses.filter((status) => status !== 'none');
  return {
    lit: withTasks.filter((status) => status === 'ok' || status === 'soon').length,
    total: withTasks.length,
  };
}

/** A key for every day on which the steps done reached the day's budget. */
export function keysEarned(tasks: Task[], budget: number): number {
  const perDay = new Map<number, number>();
  for (const task of tasks) {
    for (const time of doneList(task)) {
      const day = startOfDay(time);
      perDay.set(day, (perDay.get(day) ?? 0) + pointsOf(task));
    }
  }
  return [...perDay.values()].filter((steps) => steps >= budget).length;
}

export interface StaffNote {
  text: string;
  by: string;
  /** the sealed letter, for the rare day when every lamp is lit */
  sealed?: boolean;
}

export interface NoteSituation {
  day: number;
  hasTasks: boolean;
  /** tasks on today's list, and how many of them are still to do */
  todayCount: number;
  leftCount: number;
  /** anything at all done since midnight */
  doneSinceMidnight: boolean;
  /** the room of the most overdue task, if any task is overdue */
  waitingRoom: string | null;
  lamps: Lamps;
}

const STAFF = ['the housekeeper', 'the steward', 'the cook', 'the groundskeeper'];
/** The fewest rooms for the sealed letter to mean something. */
const LETTER_MIN_ROOMS = 2;

const ENCOURAGEMENTS = [
  'The lamps notice.',
  'Halfway up the stairs is still up the stairs.',
  'Tea is on when you are done.',
  'Someone has been dusting the banister. It was you, wasn’t it?',
  'The house is quieter already.',
  'The clock in the hall approves.',
  'Mind the third step; it creaks.',
];

/** The note left on Today. Changes with the day and with what is done. */
export function staffNote(situation: NoteSituation): StaffNote {
  const { day, lamps } = situation;
  const by = STAFF[day % STAFF.length];
  if (!situation.hasTasks) {
    return {
      text: 'Welcome to the house. Write down the chores it needs and draw the estate, and we will keep the lamps lit.',
      by: 'the steward',
    };
  }
  if (situation.todayCount > 0 && situation.leftCount === 0) {
    if (lamps.total >= LETTER_MIN_ROOMS && lamps.lit === lamps.total) {
      return {
        text: 'Every lamp in the house is lit tonight. Behind the study wall, a door you never noticed stands open.',
        by: 'the room that isn’t on the plan',
        sealed: true,
      };
    }
    return { text: 'The house is in order. Rest now.', by };
  }
  if (!situation.doneSinceMidnight) {
    const waiting = situation.waitingRoom
      ? `${situation.waitingRoom} could use some care.`
      : 'Everything is in its place.';
    return { text: `The house rearranged itself overnight. ${waiting}`, by };
  }
  const encouragement = ENCOURAGEMENTS[day % ENCOURAGEMENTS.length];
  return { text: `${plural(situation.leftCount, 'task')} left today. ${encouragement}`, by };
}
