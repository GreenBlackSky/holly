import type {
  Backup,
  CollectionRef,
  Database,
  DocData,
  DocRef,
  DocSnapshot,
  Query,
  QuerySnapshot,
  Unsubscribe,
} from './types';

/* The database as it works today: everything lives in this browser's
   localStorage, under one key, as one JSON object (the same shape as a backup
   file). Reads come from memory; every write saves the whole object again —
   a few hundred KB at most, which is instant.

   Live subscriptions (onSnapshot) are re-checked after every write, and also
   when another tab of the same app writes (the browser's 'storage' event), so
   two open tabs stay in step the way Firestore would keep two phones in step. */

type Store = Record<string, Record<string, DocData>>;

interface Subscription {
  /** Recomputes the subscriber's view; returns a string to compare with the last one. */
  read(): { key: string; deliver(): void };
  lastKey: string | null;
}

/** An error with a code, like Firestore's errors (the app checks e.code). */
export class DbError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/* Copies go through JSON: what is saved must be plain JSON anyway, and this
   also copies Svelte's reactive objects (proxies), which structuredClone
   refuses. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 20;

/** A random 20-character id, like the ones Firestore makes. */
function randomId(): string {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return id;
}

function splitDocPath(path: string): { collection: string; id: string } {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2 || parts.length % 2 !== 0) {
    throw new DbError('invalid_path', `Not a document path: ${path}`);
  }
  return { collection: parts.slice(0, -1).join('/'), id: parts[parts.length - 1] };
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) {
    return 0;
  }
  if (a === undefined || a === null) {
    return -1;
  }
  if (b === undefined || b === null) {
    return 1;
  }
  return a < b ? -1 : 1;
}

export class LocalDatabase implements Database {
  readonly name = 'This device';
  private store: Store = {};
  private readonly subscriptions = new Set<Subscription>();
  private notifyQueued = false;

  constructor(
    readonly appId: string,
    private readonly storageKey: string,
  ) {
    this.store = this.readStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === this.storageKey) {
          this.store = this.readStorage();
          this.queueNotify();
        }
      });
    }
  }

  doc<T = DocData>(path: string): DocRef<T> {
    const { collection, id } = splitDocPath(path);
    return this.docRef<T>(collection, id);
  }

  collection<T = DocData>(path: string): CollectionRef<T> {
    const collectionPath = path.split('/').filter(Boolean).join('/');
    const query = this.query<T>(collectionPath, null, null);
    return {
      ...query,
      path: collectionPath,
      doc: (id: string) => this.docRef<T>(collectionPath, id),
      add: async (data: T) => {
        const ref = this.docRef<T>(collectionPath, randomId());
        await ref.set(data);
        return ref;
      },
    };
  }

  /** Everything, as a backup file. */
  exportAll(): Backup {
    return {
      format: 'local-db-backup',
      version: 1,
      app: this.appId,
      exportedAt: new Date().toISOString(),
      collections: clone(this.store),
    };
  }

  /** Replace everything with a backup's contents. */
  importAll(backup: Backup): void {
    this.store = clone(backup.collections);
    this.persist();
    this.queueNotify();
  }

  /** True when nothing has ever been saved. */
  isEmpty(): boolean {
    return Object.values(this.store).every((docs) => Object.keys(docs).length === 0);
  }

  /* ---------------- documents ---------------- */

  private docRef<T>(collection: string, id: string): DocRef<T> {
    const path = `${collection}/${id}`;
    const snapshot = (): DocSnapshot<T> => {
      const value = this.store[collection]?.[id];
      return {
        id,
        exists: value !== undefined,
        data: () => (value === undefined ? undefined : (clone(value) as T)),
      };
    };
    return {
      id,
      path,
      get: async () => snapshot(),
      set: async (data: T) => {
        this.write(collection, id, clone(data) as DocData);
      },
      update: async (fields: Partial<T>) => {
        const current = this.store[collection]?.[id];
        if (current === undefined) {
          throw new DbError('not_found', `No document to update: ${path}`);
        }
        this.write(collection, id, { ...current, ...(clone(fields) as DocData) });
      },
      delete: async () => {
        this.write(collection, id, undefined);
      },
      onSnapshot: (next, error) =>
        this.subscribe(() => {
          const value = this.store[collection]?.[id];
          return { key: JSON.stringify(value ?? null), deliver: () => next(snapshot()) };
        }, error),
    };
  }

  /* ---------------- collections ---------------- */

  private query<T>(
    collection: string,
    order: { field: string; direction: 'asc' | 'desc' } | null,
    max: number | null,
  ): Query<T> {
    const snapshot = (): QuerySnapshot<T> => {
      let entries = Object.entries(this.store[collection] ?? {});
      if (order) {
        const sign = order.direction === 'desc' ? -1 : 1;
        entries = entries.sort(
          ([, a], [, b]) => sign * compareValues(a[order.field], b[order.field]),
        );
      }
      if (max !== null) {
        entries = entries.slice(0, max);
      }
      return {
        docs: entries.map(([id, value]) => ({ id, data: () => clone(value) as T })),
      };
    };
    return {
      get: async () => snapshot(),
      onSnapshot: (next, error) =>
        this.subscribe(() => {
          const docs = snapshot().docs.map((d) => [d.id, d.data()]);
          return { key: JSON.stringify(docs), deliver: () => next(snapshot()) };
        }, error),
      orderBy: (field, direction = 'asc') => this.query<T>(collection, { field, direction }, max),
      limit: (count) => this.query<T>(collection, order, count),
    };
  }

  /* ---------------- writing and notifying ---------------- */

  private write(collection: string, id: string, value: DocData | undefined): void {
    const before = this.store;
    const docs = { ...(before[collection] ?? {}) };
    if (value === undefined) {
      delete docs[id];
    } else {
      docs[id] = value;
    }
    this.store = { ...before, [collection]: docs };
    try {
      this.persist();
    } catch (e) {
      this.store = before;
      throw e;
    }
    this.queueNotify();
  }

  private subscribe(read: Subscription['read'], error?: (e: Error) => void): Unsubscribe {
    const subscription: Subscription = { read, lastKey: null };
    this.subscriptions.add(subscription);
    /* like Firestore: the first snapshot arrives asynchronously, right away */
    queueMicrotask(() => this.deliver(subscription, error));
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  private deliver(subscription: Subscription, error?: (e: Error) => void): void {
    if (!this.subscriptions.has(subscription)) {
      return;
    }
    try {
      const view = subscription.read();
      if (view.key !== subscription.lastKey) {
        subscription.lastKey = view.key;
        view.deliver();
      }
    } catch (e) {
      error?.(e as Error);
    }
  }

  private queueNotify(): void {
    if (this.notifyQueued) {
      return;
    }
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      for (const subscription of [...this.subscriptions]) {
        this.deliver(subscription);
      }
    });
  }

  /* ---------------- localStorage ---------------- */

  private readStorage(): Store {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as Partial<Backup>;
      return parsed.collections ?? {};
    } catch {
      return {};
    }
  }

  private persist(): void {
    const payload: Backup = {
      format: 'local-db-backup',
      version: 1,
      app: this.appId,
      exportedAt: new Date().toISOString(),
      collections: this.store,
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(payload));
    } catch (e) {
      const isQuota = e instanceof DOMException && e.name === 'QuotaExceededError';
      throw new DbError(
        isQuota ? 'quota_exceeded' : 'storage_unavailable',
        isQuota ? 'Storage is full' : 'Saving is not possible in this browser',
      );
    }
  }
}
