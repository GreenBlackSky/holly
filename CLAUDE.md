# CLAUDE.md — Holly (cleaning)

Recurring cleaning tasks on a floor plan of the house, with a daily budget
of steps. Tabs (code ids in brackets): Today "Draft the day" (`today`),
List "All tasks" (`list`), Kinds "Kinds of work" (`cats`), Estate "The
estate" (`rooms`), Stats "The ledger" (`stats`). Dev server port 5181, test
preview port 4181.

The look ("Lamplit"): a cared-for house at night, always dark. Midnight
navy (`--bg` #121A2B) with one lamp-gold accent (`--accent` #E2B05A);
Cormorant Garamond headings over Figtree; the floor plan on blueprint
paper (`.blueprint`, `--plan`) with typewritten capitals (Courier Prime);
handwritten notes from the staff (Caveat) on cream paper (`--paper`).
Rooms are lit like lamps: lit (on track), burning low (due soon), needs
care (overdue), dark (never done). The wording is a quiet manor: "steps"
for points, Redraft for Shuffle, a day counter. The inspiration is a
puzzle game about a manor; keep it unnamed and its names, rooms and art out
of the repo — the feel only.

It began as a single-file claude.ai artifact (~1,000 dense lines) called
Home Rounds and was ported to TypeScript and Svelte, matching its screens
and behaviour. It was then renamed Holly and restyled; see
`docs/ROADMAP.md` for what changed.

## The workspace (read this first)

This repo is developed inside an npm workspace: a parent folder, not in any
repo, whose `package.json` lists this project with a few others and holds
the one shared install. The app stands alone and shares no code with them.

- Some files are deliberately the same in sibling apps of the workspace
  and are kept in step by hand: `eslint.config.js`, `.prettierrc.json`,
  `src/lib/db/` (the database layer, except `index.ts`), `scripts/icons.mjs`.
- Install only from the workspace root: `npm install` there. Never run
  `npm install` inside a project (it would create a stray lock file and a
  local `node_modules` that shadows the shared one).
- Every project pins the same tool versions (exact versions in each
  `package.json`). An upgrade is done in all of them at once, then
  everything is tested: `npm test` from the workspace root.
- Machine-specific and personal notes live in the workspace's own
  CLAUDE.md, outside the repos. Keep this file free of them.

## Environment and tools

- Node 22. Editor settings (`.vscode/`) are git-ignored and machine-specific.
- Svelte 5 with runes (`$state`, `$derived`, `$effect`, `$props`); shared
  reactive state lives in `.svelte.ts` modules. TypeScript 6, Vite 8,
  `@sveltejs/vite-plugin-svelte` 7, svelte-check 4. Playwright is pinned to 1.56.1; first run needs
  `npx playwright install chromium`.

## Code style

- **Prettier** formats everything (100 columns, single quotes,
  `prettier-plugin-svelte`). **ESLint** lints (recommended JS,
  typescript-eslint and Svelte rules, plus `curly: all`, `one-var: never`,
  `prefer-const`, unused names only with a leading `_`, `no-nested-ternary`
  as a warning — there are none; don't add any).
- Before finishing a change: `npm run format`, `npm run lint` (0 errors),
  `npm run check` (0 warnings), `npm test`.
- Spelled-out names, named constants instead of magic numbers, small
  functions. Short names remain only where they are part of the saved data
  (`pts`, `cat`, `every`, `unit`, `done`, `x1/y1/x2/y2`, `pts` of a room).
- Values saved to the database go through JSON (`db/local.ts`), which also
  copes with Svelte's reactive proxies — never `structuredClone` them.

## Data

Saved through `src/lib/db` — a small Firestore-shaped API (`doc`,
`collection`, `get`, `set`, `update`, `delete`, `onSnapshot`, `orderBy`,
`limit`). Today it is `LocalDatabase`: one localStorage key,
`holly.db.v1`, holding `{format, version, app, exportedAt,
collections}` — exactly the backup file format. Data under the old name's
key, `home-rounds.db.v1`, is copied to it on first start (`db/index.ts`).
Backups carry `"app": "holly"`; backups with `"app": "home-rounds"` restore
too (`DataCard.svelte`, so the shared `db/backup.ts` stays unchanged).
Code and saved data keep the plain names: `points`/`pts`, `cats`, `rooms`.

The saved format must not break (existing backups must keep importing):

- `tasks/{id}`: `{name, room, cat, every, unit: 'd'|'w'|'m'|'y', pts, done:
number[] (ms), created}`. `unit 'y'` means _times_ a year. Old category
  ids `windows`/`doors` are mapped to `glass`/`surfaces` on load.
- `plan/main`: `{rooms: [{id, name, pts: [[x,y]…]}], features: [{id, type:
'window'|'door', x1, y1, x2, y2}], updated}` — rooms are rectilinear
  polygons on a whole-unit grid; features lie on walls.
- `today/current`: `{date: 'YYYY-MM-DD', budget, ids}`.
- `meta/categories`: `{items: [{id, name}]}` (missing → the defaults).
- UI choices (tab, room, category, hide never-done) are per device in
  localStorage `holly.ui` (read from `home-rounds.ui` if that is all
  there is).
- The day counter, lamps, keys and staff notes (`lib/house.ts`) are
  computed from the tasks; they add nothing to the saved format.

## Project notes

- Target is an Android phone: an installable PWA, later Firebase Hosting.
  Firebase is deliberately not implemented yet — only a stub.


## Commands (in this folder; install happens in the workspace root)

```
npm run dev        dev server with live reload
npm run check      svelte-check
npm run lint       ESLint (lint:fix fixes what it can)
npm run format     Prettier
npm test           builds, serves on the preview port, runs Playwright
npm run build      dist/ — the finished PWA
npm run icons      PNG icons from public/icon.svg
```


## Shape of the app

- `App.svelte` shows one tab (`ui.tab`) and whatever covers the page
  (`ui.overlay`: the task form, the today picker or the plan editor; plus
  the question box and the toast). Forms take over the page instead of
  floating, and the page underneath is hidden — on a phone a floating form
  drifts when the keyboard opens.
- `lib/state.svelte.ts` holds `app` (tasks, plan, today, categories, the
  clock) and `ui`, subscribes to the database, and has every action.
- `lib/ui/dialog.svelte.ts`: `await dialog({...})` for questions; `toast()`
  for messages with optional Undo.
- The floor plan is drawn as an SVG string (`lib/plan/render.ts`) inserted
  with `{@html}`; everything user-typed in it goes through `esc()`. The
  editor (`components/PlanEditor.svelte`) keeps its draft in plain objects
  and redraws by hand on every pointer move; the geometry is in
  `lib/plan/edit.ts` and `geometry.ts`.
- Room labels are measured with the web font (Courier Prime); `main.ts`
  clears the label cache when the font arrives.
- `lib/house.ts` — the house's own touches, pure functions: `dayNumber`,
  `countLamps`, `keysEarned`, `staffNote` (which note shows on Draft the
  day, and when the sealed letter does). `components/StaffNote.svelte`
  draws it.

Tests: `tests/smoke.spec.ts` with made-up data in `tests/sample-backup.json`
(not real data). `tests/helpers.ts` taps like a phone.

## Google backend: Firebase (planned, not started)

Not to be implemented until asked. `src/lib/db/firebase.ts` is
the stub and says how it maps. The design: one Firebase project shared with the sibling apps; one Hosting site per app serving its `dist/` as a PWA;
optional Google sign-in (redirect flow in the installed app); data in
Firestore under `users/{uid}/apps/holly/…` with the same collection
and document names as today, offline persistence on; security rules so a
user reads and writes only their own subtree; on first sign-in, offer to
upload what is in the browser. `firebase-tools` as a workspace dev
dependency (`npx firebase …`), not a global install.

See `docs/ROADMAP.md` for what is planned.
