// Renders the PNG app icons from public/icon.svg with the test browser
// (Playwright's Chromium). Run `npm run icons` after changing the SVG.
//   icon-192.png, icon-512.png   the icon as drawn (rounded tile)
//   icon-maskable-512.png        square, artwork shrunk into the safe zone,
//                                for Android's own shaped masks
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const svg = await readFile(publicDir + 'icon.svg', 'utf8');
const background = /fill="(#[0-9A-Fa-f]{6})"/.exec(svg)?.[1] ?? '#000000';
/* Android crops maskable icons to a circle of 80% of the width */
const MASKABLE_SCALE = 0.8;

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(size, file, maskable) {
  const scale = maskable ? MASKABLE_SCALE : 1;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:${maskable ? background : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">` +
      `<div style="width:${size * scale}px;height:${size * scale}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`,
  );
  await page.screenshot({ path: publicDir + file, omitBackground: !maskable });
  console.log('wrote public/' + file);
}
await render(192, 'icon-192.png', false);
await render(512, 'icon-512.png', false);
await render(512, 'icon-maskable-512.png', true);
await browser.close();
