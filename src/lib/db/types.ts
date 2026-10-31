/* The shape of the app's database: documents in collections, addressed by a
   path like 'recipes/banana_bread'. It is the small part of Firestore's API
   the app uses, so the local version (local.ts) can later be swapped for the
   real Firebase one (firebase.ts) without touching the screens.

   Think of it as a map of maps: collections['recipes']['banana_bread']
   is one document, itself a map of fields.

   This folder (src/lib/db) is the same in sibling apps of the workspace; keep the
   copies in step. */

export type DocData = Record<string, unknown>;

/** A document as read: it may not exist yet. */
export interface DocSnapshot<T = DocData> {
  readonly id: string;
  readonly exists: boolean;
  data(): T | undefined;
}

/** Every document of a collection, as read. */
export interface QuerySnapshot<T = DocData> {
  readonly docs: Array<{ id: string; data(): T }>;
}

/** Stops a live subscription. */
export type Unsubscribe = () => void;

export interface DocRef<T = DocData> {
  readonly id: string;
  readonly path: string;
  get(): Promise<DocSnapshot<T>>;
  /** Replace the whole document (creates it if missing). */
  set(data: T): Promise<void>;
  /** Change some fields of an existing document. */
  update(fields: Partial<T>): Promise<void>;
  delete(): Promise<void>;
  /** Called now and after every change, until unsubscribed. */
  onSnapshot(next: (snap: DocSnapshot<T>) => void, error?: (e: Error) => void): Unsubscribe;
}

export interface Query<T = DocData> {
  get(): Promise<QuerySnapshot<T>>;
  onSnapshot(next: (snap: QuerySnapshot<T>) => void, error?: (e: Error) => void): Unsubscribe;
  orderBy(field: string, direction?: 'asc' | 'desc'): Query<T>;
  limit(count: number): Query<T>;
}

export interface CollectionRef<T = DocData> extends Query<T> {
  readonly path: string;
  doc(id: string): DocRef<T>;
  /** Add a document under a new random id; resolves to its reference. */
  add(data: T): Promise<DocRef<T>>;
}

export interface Database {
  /** Short name for the UI, e.g. "This device" or "Firebase". */
  readonly name: string;
  doc<T = DocData>(path: string): DocRef<T>;
  collection<T = DocData>(path: string): CollectionRef<T>;
}

/** Everything in a database at once: the backup file format, and also how
    the local database keeps itself in localStorage. */
export interface Backup {
  format: 'local-db-backup';
  version: 1;
  app: string;
  exportedAt: string;
  collections: Record<string, Record<string, DocData>>;
}
