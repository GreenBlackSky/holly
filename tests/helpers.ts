import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

export const STORAGE_KEY = 'holly.db.v1';
/** where the app kept its data under its old name, Home Rounds */
export const OLD_STORAGE_KEY = 'home-rounds.db.v1';

/** Open the app fresh, with nothing saved, and collect any error it throws. */
export async function openFresh(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('nav.tabs');
  return errors;
}

/** Open the app with a backup file's contents already saved. */
export async function openWith(page: Page, backupPath: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const backup = readFileSync(new URL(backupPath, import.meta.url), 'utf8');
  await page.goto('/');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, backup]);
  await page.reload();
  await page.waitForSelector('nav.tabs');
  return errors;
}

/** A real tap (touch events), then a moment for the screen to update. */
export async function tap(page: Page, selector: string): Promise<void> {
  const element = page.locator(selector).first();
  await element.scrollIntoViewIfNeeded();
  await element.tap();
  await page.waitForTimeout(100);
}

/** Answer the open question box by its button text. */
export async function answer(page: Page, label: string): Promise<void> {
  await page.locator('.dlg-actions button', { hasText: label }).tap();
  await page.waitForTimeout(100);
}

/** Everything saved, as the app sees it. */
export async function saved(page: Page): Promise<Record<string, Record<string, unknown>>> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '{}').collections ?? {},
    STORAGE_KEY,
  );
}

export async function expectNoErrors(errors: string[]): Promise<void> {
  expect(errors).toEqual([]);
}
