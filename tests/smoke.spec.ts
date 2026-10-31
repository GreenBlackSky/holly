import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  answer,
  expectNoErrors,
  OLD_STORAGE_KEY,
  openFresh,
  openWith,
  saved,
  STORAGE_KEY,
  tap,
} from './helpers';

/* Every tab draws, empty and with real data; nothing throws anywhere. */

const TABS = ['today', 'list', 'cats', 'rooms', 'stats'];
const SAMPLE = './sample-backup.json';

test('every tab draws on a fresh install', async ({ page }) => {
  const errors = await openFresh(page);
  for (const tab of TABS) {
    await tap(page, `#tab-${tab}`);
    await expect(page.locator('main h1')).toBeVisible();
  }
  await expectNoErrors(errors);
});

test('every tab draws with real data', async ({ page }) => {
  const errors = await openWith(page, SAMPLE);
  for (const tab of TABS) {
    await tap(page, `#tab-${tab}`);
    await expect(page.locator('main h1')).toBeVisible();
  }
  await tap(page, '#tab-rooms');
  await expect(page.locator('svg.plan g.room').first()).toBeVisible();
  await tap(page, '#tab-today');
  await expect(page.locator('main .task').first()).toBeVisible();
  await expectNoErrors(errors);
});

test('add a task, tick it off, undo', async ({ page }) => {
  const errors = await openFresh(page);
  await tap(page, '#tab-list');
  await tap(page, '[data-new]');
  await page.locator('#f-name').fill('Water the plants');
  await page.locator('#f-every').fill('3');
  await page.locator('#f-unit').selectOption('d');
  await expect(page.locator('#f-hint')).toHaveText('Shown as: every 3 days');
  await tap(page, '[data-pts="1"]');
  await tap(page, '#f-save');
  await expect(page.locator('main .t-name', { hasText: 'Water the plants' })).toBeVisible();

  await tap(page, 'main [data-done]');
  await expect(page.locator('.toast')).toContainText('Water the plants');
  let tasks = (await saved(page)).tasks as Record<string, { done: number[] }>;
  expect(Object.values(tasks)[0].done).toHaveLength(1);

  await tap(page, '#undo-btn');
  tasks = (await saved(page)).tasks as Record<string, { done: number[] }>;
  expect(Object.values(tasks)[0].done).toHaveLength(0);
  await expectNoErrors(errors);
});

test('today picks tasks within the budget, and the budget can change', async ({ page }) => {
  const errors = await openWith(page, SAMPLE);
  await tap(page, '#tab-today');
  await tap(page, '[data-budget]');
  await page.locator('#dlg-in').fill('3');
  await answer(page, 'Save');
  await expect(page.locator('[data-budget]')).toHaveText('3 steps');
  await tap(page, '[data-shuffle]');
  await expect(page.locator('.prog-text')).toContainText('of 3 steps done');
  await expectNoErrors(errors);
});

test('categories: add, rename, delete', async ({ page }) => {
  const errors = await openFresh(page);
  await tap(page, '#tab-cats');
  await tap(page, '[data-newcat]');
  await page.locator('#dlg-in').fill('Garden');
  await answer(page, 'Add category');
  await expect(page.locator('.section-title h2')).toHaveText('Garden');
  await tap(page, '.cat-tools .btn:not(.danger)');
  await page.locator('#dlg-in').fill('Balcony');
  await answer(page, 'Save');
  await expect(page.locator('.tile.sel .tn')).toHaveText('Balcony');
  await tap(page, '.cat-tools .btn.danger');
  await answer(page, 'Delete');
  await expect(page.locator('.tile .tn', { hasText: 'Balcony' })).toHaveCount(0);
  await expectNoErrors(errors);
});

test('plan editor: add a room, a window, save', async ({ page }) => {
  const errors = await openFresh(page);
  await tap(page, '#tab-rooms');
  await tap(page, '[data-edit-plan]');
  await tap(page, '#ed-add');
  await page.locator('#dlg-in').fill('Kitchen');
  await answer(page, 'Add room');
  await expect(page.locator('#ed-svg .eroom')).toHaveCount(1);

  /* place a window: tap the button, then tap the room's top wall */
  await tap(page, '#ed-win');
  const wall = page.locator('#ed-svg [data-h="e:0"].he');
  const box = (await wall.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 20, box.y + box.height / 2);
  await expect(page.locator('#ed-svg .win')).toHaveCount(1);

  await tap(page, '#ed-save');
  await expect(page.locator('svg.plan g.room')).toHaveCount(1);
  const plan = (await saved(page)).plan as { main: { rooms: unknown[]; features: unknown[] } };
  expect(plan.main.rooms).toHaveLength(1);
  expect(plan.main.features).toHaveLength(1);
  await expectNoErrors(errors);
});

test('a backup saves and restores', async ({ page }) => {
  const errors = await openWith(page, SAMPLE);
  await tap(page, '#tab-stats');
  const download = page.waitForEvent('download');
  await tap(page, '[data-export]');
  const file = await (await download).path();

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await tap(page, '#tab-stats');
  await page.locator('input[type=file]').setInputFiles(file);
  await answer(page, 'Replace');
  await tap(page, '#tab-list');
  await expect(page.locator('main .task')).toHaveCount(84);
  await expectNoErrors(errors);
});

/* The app was called Home Rounds: its data and its backups come along. */

test('data saved under the old name is carried over', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const backup = readFileSync(new URL(SAMPLE, import.meta.url), 'utf8').replace(
    '"app": "holly"',
    '"app": "home-rounds"',
  );
  await page.goto('/');
  await page.evaluate(
    ([key, value]) => {
      localStorage.clear();
      localStorage.setItem(key, value);
    },
    [OLD_STORAGE_KEY, backup],
  );
  await page.reload();
  await tap(page, '#tab-list');
  await expect(page.locator('main .task')).toHaveCount(84);
  expect(await page.evaluate((key) => localStorage.getItem(key) !== null, STORAGE_KEY)).toBe(true);
  await expectNoErrors(errors);
});

test('a backup made under the old name restores', async ({ page }) => {
  const errors = await openFresh(page);
  const backup = readFileSync(new URL(SAMPLE, import.meta.url), 'utf8').replace(
    '"app": "holly"',
    '"app": "home-rounds"',
  );
  await tap(page, '#tab-stats');
  await page.locator('input[type=file]').setInputFiles({
    name: 'home-rounds-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backup),
  });
  await answer(page, 'Replace');
  await tap(page, '#tab-list');
  await expect(page.locator('main .task')).toHaveCount(84);
  await expectNoErrors(errors);
});

test('the house: a staff note, the day counter, lamps on the estate', async ({ page }) => {
  const errors = await openFresh(page);
  await tap(page, '#tab-today');
  await expect(page.locator('[data-note]')).toContainText('Welcome to the house');
  await expect(page.locator('.kicker')).toHaveText('DAY 1');

  await openWith(page, SAMPLE);
  await tap(page, '#tab-today');
  await expect(page.locator('[data-note] .by')).toContainText('— the');
  await tap(page, '#tab-rooms');
  await expect(page.locator('main .head .sub')).toContainText(/Lamps lit in \d+ of \d+ rooms/);
  await tap(page, '#tab-stats');
  await expect(page.locator('[data-lamps] .kv')).toBeVisible();
  await expect(page.locator('[data-keys] .kv')).toHaveText(/^\d+$/);
  await expectNoErrors(errors);
});
