import { db, DbError } from './db';
import { countLamps, type Lamps } from './house';
import type { Plan } from './plan/geometry';
import { groupStatus, isNew, makeId, normalizeTask, pointsOf, type Task } from './tasks';
import { clampBudget, DEFAULT_BUDGET, dayKey, doneToday, pickToday, type TodayPlan } from './today';
import { dialog } from './ui/dialog.svelte';
import { toast } from './ui/toast.svelte';

/* Everything the screens show, kept live from the database, and every action
   that changes it. Svelte re-draws whatever reads a $state value when it
   changes — like a spreadsheet recalculating, not like calling render(). */

export interface Category {
  id: string;
  name: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  /** up to 4 letters, for the narrow column headers on Stats */
  short: string;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'floors', name: 'Floors' },
  { id: 'dusting', name: 'Dusting' },
  { id: 'glass', name: 'Glass surfaces' },
  { id: 'surfaces', name: 'Surfaces' },
  { id: 'fixtures', name: 'Bath and toilet' },
  { id: 'appliances', name: 'Appliances' },
  { id: 'textiles', name: 'Bedding and textiles' },
  { id: 'trash', name: 'Trash' },
  { id: 'cats', name: 'Cats' },
];

export const WHOLE_HOME: RoomInfo = { id: 'home', name: 'Whole home', short: 'All' };

export type Tab = 'today' | 'list' | 'cats' | 'rooms' | 'stats';

/** What covers the page, if anything (forms take over the page instead of floating). */
export type Overlay =
  { kind: 'task'; id: string | null } | { kind: 'picker' } | { kind: 'editor' } | null;

/* ---------------- state ---------------- */

export const app = $state({
  tasks: [] as Task[],
  loaded: false,
  plan: null as Plan | null,
  planLoaded: false,
  today: null as TodayPlan | null,
  todayLoaded: false,
  categories: DEFAULT_CATEGORIES,
  /** the clock, ticking once a minute so "due in 3 h" stays right */
  now: Date.now(),
  /** flips to true when the web fonts arrive; room labels are re-measured then */
  fontsLoaded: false,
});

/** Screen choices, remembered between visits on this device only. */
export const ui = $state({
  tab: 'today' as Tab,
  room: null as string | null,
  cat: null as string | null,
  hideNew: false,
  overlay: null as Overlay,
});

const UI_STORAGE_KEY = 'holly.ui';
/** the app's old name; its screen choices are carried over */
const OLD_UI_STORAGE_KEY = 'home-rounds.ui';

function loadUi(): void {
  try {
    const stored = localStorage.getItem(UI_STORAGE_KEY) ?? localStorage.getItem(OLD_UI_STORAGE_KEY);
    const saved = JSON.parse(stored ?? '{}');
    if (saved.tab) {
      ui.tab = saved.tab;
    }
    ui.room = saved.room ?? null;
    ui.cat = saved.cat ?? null;
    ui.hideNew = Boolean(saved.hideNew);
  } catch {
    /* nothing remembered: defaults */
  }
}

export function saveUi(): void {
  try {
    const { tab, room, cat, hideNew } = ui;
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ tab, room, cat, hideNew }));
  } catch {
    /* private mode: just not remembered */
  }
}

/* ---------------- derived lookups ---------------- */

export function rooms(): RoomInfo[] {
  const planRooms = app.plan?.rooms ?? [];
  return planRooms
    .map((room) => ({
      id: room.id,
      name: room.name,
      short: (room.name || '').replace(/\s+room$/i, '').slice(0, 4),
    }))
    .concat([WHOLE_HOME]);
}

export function roomName(id: string): string {
  return rooms().find((room) => room.id === id)?.name ?? (id || '—');
}

export function categoryName(id: string): string {
  return app.categories.find((category) => category.id === id)?.name ?? (id || '—');
}

/** The tasks on show: all, or all but never-done ones when those are hidden. */
export function visibleTasks(): Task[] {
  return app.tasks.filter((task) => !(ui.hideNew && isNew(task)));
}

export function taskById(id: string): Task | undefined {
  return app.tasks.find((task) => task.id === id);
}

export function todayIds(): string[] {
  return app.today && Array.isArray(app.today.ids) ? app.today.ids : [];
}

export function todayBudget(): number {
  return Number(app.today?.budget) || DEFAULT_BUDGET;
}

/* ---------------- loading ---------------- */

function setCategories(items: unknown): void {
  const valid = Array.isArray(items)
    ? (items as Category[]).filter((category) => category && category.id && category.name)
    : [];
  app.categories = valid.length ? valid : DEFAULT_CATEGORIES;
}

const MINUTE_MS = 60_000;

/** Start listening to the database. Call once at start-up. */
export function startState(): void {
  loadUi();
  db.collection<Partial<Task>>('tasks').onSnapshot((snap) => {
    app.tasks = snap.docs
      .map((doc) => normalizeTask(doc.id, doc.data()))
      .filter((task): task is Task => task !== null);
    app.loaded = true;
    /* a task just ticked off should read "just now", not wait for the next minute */
    app.now = Date.now();
  });
  db.doc<TodayPlan>('today/current').onSnapshot((snap) => {
    if (snap.exists) {
      app.today = snap.data() ?? null;
    }
    app.todayLoaded = true;
  });
  db.doc<{ items: Category[] }>('meta/categories').onSnapshot((snap) => {
    setCategories(snap.exists ? snap.data()?.items : null);
  });
  db.doc<Plan>('plan/main').onSnapshot((snap) => {
    app.plan = snap.exists ? (snap.data() ?? null) : { rooms: [], features: [] };
    app.planLoaded = true;
  });
  setInterval(() => {
    app.now = Date.now();
  }, MINUTE_MS);
}

/* ---------------- saving ---------------- */

function saveErrorMessage(e: unknown): string {
  return e instanceof DbError && e.code === 'quota_exceeded'
    ? 'Storage is full. Delete old tasks to add more.'
    : 'Couldn’t save. Try again.';
}

/** Write one task; shows a message and returns false if it failed. */
export async function writeTask(
  id: string,
  change: (ref: ReturnType<typeof db.doc<Task>>) => Promise<void>,
): Promise<boolean> {
  try {
    await change(db.doc<Task>('tasks/' + id));
    return true;
  } catch (e) {
    toast(saveErrorMessage(e));
    return false;
  }
}

export async function saveToday(plan: TodayPlan): Promise<void> {
  app.today = plan;
  try {
    await db.doc<TodayPlan>('today/current').set(plan);
  } catch {
    toast('Couldn’t save today’s plan');
  }
}

/** On a new day, pick a fresh list. Safe to call any time. */
export function ensureToday(): void {
  if (!app.loaded || !app.tasks.length || !app.todayLoaded) {
    return;
  }
  const key = dayKey(app.now);
  if (app.today && app.today.date === key) {
    return;
  }
  void saveToday({
    date: key,
    budget: todayBudget(),
    ids: pickToday({
      all: app.tasks,
      visible: visibleTasks(),
      budget: todayBudget(),
      keep: [],
      now: Date.now(),
    }),
  });
}

/** Pick again, keeping what is already done today. */
export function shuffleToday(): void {
  const now = Date.now();
  const keep = todayIds().filter((id) => {
    const task = taskById(id);
    return task && doneToday(task, now);
  });
  void saveToday({
    date: dayKey(now),
    budget: todayBudget(),
    ids: pickToday({
      all: app.tasks,
      visible: visibleTasks(),
      budget: todayBudget(),
      keep,
      now,
    }),
  });
}

export function addToToday(id: string): void {
  if (!todayIds().includes(id)) {
    void saveToday({
      date: dayKey(Date.now()),
      budget: todayBudget(),
      ids: todayIds().concat([id]),
    });
  }
}

export function removeFromToday(id: string): void {
  void saveToday({
    date: dayKey(Date.now()),
    budget: todayBudget(),
    ids: todayIds().filter((other) => other !== id),
  });
}

export async function askBudget(): Promise<void> {
  const result = await dialog({
    title: 'Steps for a day',
    text: 'How many steps do you want to plan for an average day? 1 step is about 5 to 10 minutes.',
    input: String(todayBudget()),
    actions: [
      { label: 'Cancel', value: false },
      { label: 'Save', value: true, kind: 'primary' },
    ],
  });
  if (!result.value) {
    return;
  }
  const budget = clampBudget(parseInt(result.text, 10), todayBudget());
  void saveToday({ date: dayKey(Date.now()), budget, ids: todayIds() });
}

/* tasks being saved right now, so a double tap does not log twice; nothing
   on screen reads it, so it does not need to be reactive */
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const pending = new Set<string>();

export function isPending(id: string): boolean {
  return pending.has(id);
}

export async function markDone(id: string): Promise<void> {
  const task = taskById(id);
  if (pending.has(id) || !task) {
    return;
  }
  pending.add(id);
  const time = Date.now();
  const next = [...(task.done ?? []), time];
  const ok = await writeTask(id, (ref) => ref.update({ done: next }));
  pending.delete(id);
  if (!ok) {
    return;
  }
  if (app.today && app.today.date === dayKey(Date.now()) && !todayIds().includes(id)) {
    void saveToday({ ...app.today, ids: todayIds().concat([id]) });
  }
  toast(`${task.name} · ${roomName(task.room)} done`, async () => {
    const current = taskById(id);
    if (current) {
      await writeTask(id, (ref) =>
        ref.update({ done: (current.done ?? []).filter((other) => other !== time) }),
      );
    }
  });
}

/* ---------------- categories ---------------- */

async function saveCategories(list: Category[]): Promise<boolean> {
  try {
    await db.doc('meta/categories').set({ items: list });
    setCategories(list);
    return true;
  } catch {
    toast('Couldn’t save categories. Try again.');
    return false;
  }
}

/** Ask for a name and add a category; resolves to its id (an existing one
    if the name is taken), or null if cancelled. */
export async function newCategory(): Promise<string | null> {
  const result = await dialog({
    title: 'New category',
    input: '',
    actions: [
      { label: 'Cancel', value: false },
      { label: 'Add category', value: true, kind: 'primary' },
    ],
  });
  if (!result.value || !result.text) {
    return null;
  }
  const existing = app.categories.find(
    (category) => category.name.toLowerCase() === result.text.toLowerCase(),
  );
  if (existing) {
    return existing.id;
  }
  const id = makeId(result.text, 24, 4, 'cat');
  const saved = await saveCategories(app.categories.concat([{ id, name: result.text }]));
  return saved ? id : null;
}

export async function renameCategory(id: string): Promise<void> {
  const category = app.categories.find((other) => other.id === id);
  if (!category) {
    return;
  }
  const result = await dialog({
    title: 'Rename category',
    input: category.name,
    actions: [
      { label: 'Cancel', value: false },
      { label: 'Save', value: true, kind: 'primary' },
    ],
  });
  if (!result.value || !result.text || result.text === category.name) {
    return;
  }
  const renamed = app.categories.map((other) =>
    other.id === id ? { ...other, name: result.text } : other,
  );
  if (await saveCategories(renamed)) {
    toast('Renamed');
  }
}

export async function deleteCategory(id: string): Promise<void> {
  const category = app.categories.find((other) => other.id === id);
  if (!category) {
    return;
  }
  if (app.categories.length <= 1) {
    toast('Keep at least one category');
    return;
  }
  const inCategory = app.tasks.filter((task) => task.cat === id);
  let target: string | null = null;
  if (inCategory.length) {
    const others = app.categories.filter((other) => other.id !== id);
    const several = inCategory.length > 1;
    const result = await dialog({
      title: `Delete ${category.name}?`,
      text: `It has ${inCategory.length} task${several ? 's' : ''}. Move ${several ? 'them' : 'it'} to:`,
      select: { options: others, value: others[0].id },
      actions: [
        { label: 'Cancel', value: false },
        { label: 'Move and delete', value: true, kind: 'danger' },
      ],
    });
    if (!result.value) {
      return;
    }
    target = result.selected;
  } else {
    const result = await dialog({
      title: `Delete ${category.name}?`,
      actions: [
        { label: 'Cancel', value: false },
        { label: 'Delete', value: true, kind: 'danger' },
      ],
    });
    if (!result.value) {
      return;
    }
  }
  for (const task of inCategory) {
    if (!(await writeTask(task.id, (ref) => ref.update({ cat: target as string })))) {
      return;
    }
  }
  if (await saveCategories(app.categories.filter((other) => other.id !== id))) {
    ui.cat = target;
    saveUi();
    toast('Category deleted');
  }
}

/* ---------------- the floor plan ---------------- */

export interface RoomDeletion {
  id: string;
  /** what happens to the room's tasks */
  action: 'home' | 'delete';
}

export async function savePlan(plan: Plan, deletions: RoomDeletion[]): Promise<boolean> {
  const saved: Plan = {
    rooms: plan.rooms.map((room) => ({ id: room.id, name: room.name, pts: room.pts })),
    features: plan.features,
    updated: Date.now(),
  };
  try {
    await db.doc<Plan>('plan/main').set(saved);
    for (const deletion of deletions) {
      for (const task of app.tasks.filter((other) => other.room === deletion.id)) {
        const ref = db.doc<Task>('tasks/' + task.id);
        if (deletion.action === 'delete') {
          await ref.delete();
        } else {
          await ref.update({ room: WHOLE_HOME.id });
        }
      }
    }
    app.plan = saved;
    return true;
  } catch {
    toast('Couldn’t save the plan. Try again.');
    return false;
  }
}

/** How the lamps stand in the rooms of the plan (the whole home is not a room). */
export function lamps(): Lamps {
  const planRooms = app.plan?.rooms ?? [];
  const tasks = visibleTasks();
  return countLamps(
    planRooms.map(
      (room) =>
        groupStatus(
          tasks.filter((task) => task.room === room.id),
          app.now,
        ).status,
    ),
  );
}

/** Sum of effort points. */
export function pointsSum(list: Task[]): number {
  return list.reduce((sum, task) => sum + pointsOf(task), 0);
}
