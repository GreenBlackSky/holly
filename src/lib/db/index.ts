import { LocalDatabase } from './local';

/* The one database the app uses. Today: this browser's storage. When Firebase
   is set up, this is where FirebaseDatabase gets chosen for a signed-in user
   (see firebase.ts) — the screens only ever see the Database interface. */

export const APP_ID = 'holly';

/** The app was called Home Rounds before; its backups still restore. */
export const OLD_APP_ID = 'home-rounds';

const STORAGE_KEY = 'holly.db.v1';

/* Data saved under the old name's key is copied to the new one on first
   start (the old copy is left as it was). */
const OLD_STORAGE_KEY = 'home-rounds.db.v1';
try {
  if (localStorage.getItem(STORAGE_KEY) === null) {
    const old = localStorage.getItem(OLD_STORAGE_KEY);
    if (old !== null) {
      localStorage.setItem(STORAGE_KEY, old);
    }
  }
} catch {
  /* storage blocked: nothing to carry over */
}

export const db = new LocalDatabase(APP_ID, STORAGE_KEY);

export type { Database, DocData, DocRef, CollectionRef, DocSnapshot, Backup } from './types';
export { DbError } from './local';
