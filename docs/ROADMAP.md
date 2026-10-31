# Holly — roadmap

Nothing below is built yet.

## Light and dark mode

Not to be implemented until asked. Today the app is always dark (the
"Lamplit" look in midnight navy). Design a daytime twin — evening blue
walls (around #E4E8EF), the same lamp gold, cream staff notes, the floor
plan still on blueprint navy — then add a switch: Match device / Light /
Dark, saved per device in localStorage `holly.ui` (not in the database).
The colours are already tokens at the top of `app.css`; the light set goes
beside the dark one under `data-theme` / `prefers-color-scheme`, and the
`theme-color` meta tag follows the choice.

## Firebase

1. **Hosting**: this app's `dist/` on its own Firebase Hosting site, so the
   phone installs it from an https address.
2. **Sign-in and sync**: Google sign-in (optional); the data moves to
   Firestore under `users/{uid}/apps/holly/`, same documents as today.
   Then the phone and the computer see the same tasks. Implement
   `FirebaseDatabase` in `src/lib/db/firebase.ts`; nothing else should need
   to change except `db/index.ts` choosing it.
3. **Moving in**: on first sign-in, upload what is in this browser (it is
   already in the backup format).

## Changed since the port

- Renamed from Home Rounds to Holly and restyled (2026-10-31): midnight
  navy with lamp gold, Cormorant Garamond headings over Figtree, the floor
  plan drawn as a blueprint with typewritten room names, rooms lit like
  lamps (lit, burning low, needs care, dark). Points are called steps;
  Shuffle is Redraft; the screens are Draft the day, All tasks, Kinds of
  work, The estate and The ledger.
- New touches, all computed from the saved data (nothing new is saved): a
  day counter (Day 1 = the first task or completion), a handwritten note
  from the staff on Draft the day (a welcome on a fresh install, "the house
  rearranged itself overnight" each morning, a word of encouragement, "the
  house is in order" when the day is done), lamps lit counted on The
  estate and The ledger, keys (days on which the steps done reached the
  budget), and a sealed letter on the rare day every lamp is lit and the
  day's list is done.
- Data saved under the old name (`home-rounds.db.v1`, `home-rounds.ui`) is
  copied over on first start, and backups made under the old name
  (`"app": "home-rounds"`) still restore.

## Fixed during the port

- Rooms, and Stats' rooms × categories cells, whose tasks were all never
  done were drawn solid black (the original had no colour for that state).
  They now use the plain floor colour.
- Undoing a room deletion in the plan editor now also cancels what was to
  happen to its tasks.
- A question asked from inside the task form (a new category) used to open
  below the form, out of sight; now the form hides while the question shows.

## Ideas, not decided

- Draft the day as a real draft: instead of picking the whole list at once,
  offer three task cards at a time and let you choose one, until the
  budget of steps is full. Redraft would deal three new cards.
- Reminders: a daily notification with today's list (needs the installed
  PWA and notification permission; with Firebase, Cloud Messaging).
- Sharing the house: two people on the same task list (Firestore makes this
  a matter of rules and a shared document path).
- Unit tests for `lib/tasks.ts`, `lib/today.ts`, `lib/house.ts` and the plan
  geometry (all pure functions; `pickToday` needs a seeded `Math.random`).
