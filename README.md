# Holly

Recurring cleaning tasks on a floor plan of the house. Each task repeats
every so many days, weeks or months. On the estate, a blueprint of your
home, each room is lit like a lamp while its tasks are in hand, and glows
red when something is overdue. Each morning it drafts a handful of tasks to
fill a daily budget of steps, and the staff leave you a note.

It began as a single-file claude.ai artifact called Home Rounds and was
ported to TypeScript and Svelte. Data and backups from Home Rounds carry
over. It lives in the `apps` workspace with the other phone apps, which
installs the tools for all of them at once (see `apps/README.md`).

## Running it

You need Node.js. Install once in the `apps` folder (`npm install`
there), then in this folder:

```
npm run dev        a local server with instant reload
```

`npm run dev` prints two addresses. `localhost` works on this computer. The
`Network` one works on your phone too, if it is on the same Wi-Fi.

Your data lives in the browser you use the app in (until Firebase is set up),
so data on the computer and on the phone are separate. To move it, use
**Stats (The ledger) → Your data → Save backup**, then **Restore backup…** on the other
device. The file exported from the original artifact
restores the same way.

## Checking it

```
npm run check      TypeScript and Svelte type checking
npm run lint       code problems (ESLint); lint:fix repairs what it can
npm run format     tidy the layout of every file (Prettier)
npm test           builds the app and drives it in a headless phone-sized
                   browser (first time: npx playwright install chromium)
npm run icons      re-draw the PNG icons after changing public/icon.svg
```

## Building and deploying

`npm run build` writes `dist/` — plain files, the whole app. Uploading that
folder anywhere that serves https makes it installable on Android: open the
address in Chrome, then _Add to Home screen_. It then runs full-screen and
works offline. With Firebase Hosting, once the project exists:

```
npx firebase login
npx firebase init hosting      public directory: dist, single-page app: yes
npm run build && npx firebase deploy
```

## What's where

```
src/
  main.ts              starts the app
  App.svelte           one tab at a time, the tab bar, and what covers the page
  app.css              the one stylesheet (colours as tokens; always dark)
  screens/             one file per tab: Today, List, Categories, Rooms, Stats
  components/          pieces of screens: task rows, the task form, the plan
                       editor, the staff note, the question box, the toast,
                       the backup card
  lib/
    tasks.ts           task maths: how often, when due, how late
    today.ts           drafting today's list to fill the budget of steps
    house.ts           the day counter, lamps, keys and the staff's notes
    stats.ts           the numbers behind Stats
    state.svelte.ts    everything on screen, kept live from the database,
                       and every action that changes it
    plan/              floor plan: geometry, drawing (SVG), editing
    db/                the database: local (today), Firebase (stub), backups
    ui/                the question box and toast, as functions
public/                icons for the home screen
tests/                 end-to-end tests and their sample data
```
