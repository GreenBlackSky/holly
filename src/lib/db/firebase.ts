import type { CollectionRef, Database, DocData, DocRef } from './types';

/* ---------------- Firebase (not wired up yet) ----------------
   The stub the app switches to once there is a Firebase project. Until then
   index.ts always picks the local database, and nothing here runs.

   The plan, so the rest of the app does not have to change later:

     1. One Firebase project shared with the sibling apps; Google sign-in with
        Firebase Auth (redirect flow in the installed app).
     2. Each signed-in user's data under their own path, one subtree per app,
        with the same collection and document names as today:
          users/{uid}/apps/{appId}/{collection}/{docId}
        so doc('recipes/x') here becomes
          doc(firestore, 'users', uid, 'apps', appId, 'recipes', 'x').
     3. Firestore's offline persistence on, so using the app with no signal
        still works and syncs later.
     4. Security rules: a user reads and writes only users/{their uid}/….
     5. On first sign-in, offer to upload what is in this browser (the same
        format as a backup file).

   Each method below maps one-to-one onto the modular Firebase SDK (getDoc,
   setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, orderBy, limit),
   loaded lazily so the app stays small for anyone not signed in. */

export interface FirebaseOptions {
  appId: string;
  /** The web-app config from the Firebase console (public by design). */
  config?: Record<string, string>;
}

function notYet(): never {
  throw new Error('Firebase is not set up yet');
}

export class FirebaseDatabase implements Database {
  readonly name = 'Firebase';
  constructor(readonly options: FirebaseOptions) {}

  doc<T = DocData>(_path: string): DocRef<T> {
    // TODO(firebase): doc(firestore, 'users', uid, 'apps', appId, ...path)
    return notYet();
  }

  collection<T = DocData>(_path: string): CollectionRef<T> {
    // TODO(firebase): collection(firestore, 'users', uid, 'apps', appId, ...path)
    return notYet();
  }
}
