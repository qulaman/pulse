/**
 * The small IndexedDB behind each thing a phone keeps until the server has it (D-130, principle 5):
 * kept phrases (lib/voice/kept.ts), files of a thread (lib/media/pending.ts), notes
 * (lib/notes/pending.ts). One database per keeper; every store is keyed by `id`.
 *
 * The name, the version and the store names are the phones' data: people carry recordings in
 * them right now. Never rename one, and raise a version only together with a new store.
 *
 * Every call degrades to «nothing kept» where IndexedDB is missing (private mode, an old
 * WebView): `ok: false`, and the caller keeps the in-memory path it had before.
 */
export type IdbStore = {
  /** One request in its own transaction; resolves when the transaction is durable. */
  run<T>(store: string, mode: IDBTransactionMode, make: (target: IDBObjectStore) => IDBRequest<T>): Promise<{ ok: boolean; value?: T }>;
  /**
   * One line for reads and writes: a patch is read-modify-write, and in a line the last word
   * always wins and a reader never sees a step before the one written ahead of it.
   */
  queued<T>(step: () => Promise<T>): Promise<T>;
  /** The views and the replay redraw when the phone's list changes. */
  subscribe(listener: () => void): () => void;
  changed(): void;
  /**
   * One carrier per entry inside this tab: the live path and the replay must never both upload,
   * transcribe or send it — the server would dedupe the row, but STT would be paid twice.
   */
  claim(id: string): boolean;
  release(id: string): void;
  isClaimed(id: string): boolean;
};

export function idbStore(name: string, version: number, stores: readonly string[]): IdbStore {
  let opening: Promise<IDBDatabase | null> | null = null;

  function database(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    opening ??= new Promise((resolve) => {
      try {
        const request = indexedDB.open(name, version);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const store of stores) {
            if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return opening;
  }

  let line: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  const claimed = new Set<string>();

  return {
    async run(store, mode, make) {
      const db = await database();
      if (!db) return { ok: false };
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(store, mode);
          const request = make(tx.objectStore(store));
          tx.oncomplete = () => resolve({ ok: true, value: request.result });
          tx.onerror = () => resolve({ ok: false });
          tx.onabort = () => resolve({ ok: false });
        } catch {
          resolve({ ok: false });
        }
      });
    },
    queued(step) {
      const next = line.then(step, step);
      line = next.catch(() => undefined);
      return next;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    changed() {
      for (const listener of listeners) listener();
    },
    claim(id) {
      if (claimed.has(id)) return false;
      claimed.add(id);
      return true;
    },
    release(id) {
      claimed.delete(id);
    },
    isClaimed(id) {
      return claimed.has(id);
    },
  };
}
