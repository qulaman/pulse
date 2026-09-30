/**
 * Voice and photos of a task's thread — and a report with a photo — kept on the phone until
 * they are on the server (principle 5, D-130). A voice message used to live only in the page
 * until its upload finished: no network at the site, and «Голосовое не отправилось» was the
 * end of it; a report with a photo could not be handed in at all. Now the file goes into
 * IndexedDB before the first byte leaves, and ./replay.ts carries it on once there is network,
 * under the keys minted at the tap: the Storage path, the message id, the transition key.
 *
 * Every call degrades to «nothing kept» where IndexedDB is missing (private mode, an old
 * WebView) — the caller then keeps the in-memory path it had before.
 */

export type PendingMediaKind = "voice" | "photo" | "report";

export type PendingMedia = {
  /** The message id (voice, photo) or the transition key (report): the server dedupes by it. */
  id: string;
  kind: PendingMediaKind;
  userId: string;
  companyId: string;
  taskId: string;
  /** The Storage key of the file: `{company}/{user}/{crid}.{ext}`, the same on every retry. */
  crid: string;
  blob: Blob;
  mime: string;
  ext: string;
  /** The recording's length (voice) — the player draws it without downloading anything. */
  durationMs: number | null;
  /** A caption, or the report's words. */
  text: string;
  /** «Сделано не всё» (report, D-128). */
  partial: boolean;
  /** Set once the file is in Storage — a retry does not upload it again. */
  filePath: string | null;
  createdAt: string;
  attempts: number;
};

/** The file as bytes, not a Blob: WebKit refuses a Blob in IndexedDB in an ephemeral session (see lib/voice/kept.ts). */
type StoredMedia = Omit<PendingMedia, "blob"> & { bytes: ArrayBuffer };

function fromStored(entry: StoredMedia): PendingMedia {
  const { bytes, ...rest } = entry;
  return { ...rest, blob: new Blob([bytes], { type: entry.mime }) };
}

const DB_NAME = "pulse-media";
const DB_VERSION = 1;
const ITEMS = "items";

let opening: Promise<IDBDatabase | null> | null = null;

function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: "id" });
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

async function run<T>(mode: IDBTransactionMode, make: (target: IDBObjectStore) => IDBRequest<T>): Promise<{ ok: boolean; value?: T }> {
  const db = await database();
  if (!db) return { ok: false };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(ITEMS, mode);
      const request = make(tx.objectStore(ITEMS));
      tx.oncomplete = () => resolve({ ok: true, value: request.result });
      tx.onerror = () => resolve({ ok: false });
      tx.onabort = () => resolve({ ok: false });
    } catch {
      resolve({ ok: false });
    }
  });
}

/** Reads and writes in one line: a patch is read-modify-write (as lib/voice/kept.ts). */
let line: Promise<unknown> = Promise.resolve();
function queued<T>(step: () => Promise<T>): Promise<T> {
  const next = line.then(step, step);
  line = next.catch(() => undefined);
  return next;
}

const listeners = new Set<() => void>();

export function subscribeMedia(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function changed() {
  for (const listener of listeners) listener();
}

/** Keep a file on the phone. False — nothing was kept (no IndexedDB here). */
export async function keepMedia(item: PendingMedia): Promise<boolean> {
  let stored: StoredMedia;
  try {
    const { blob, ...rest } = item;
    stored = { ...rest, bytes: await blob.arrayBuffer() };
  } catch {
    return false;
  }
  return queued(async () => {
    const { ok } = await run("readwrite", (store) => store.put(stored));
    if (ok) changed();
    return ok;
  });
}

export function patchMedia(id: string, patch: Partial<Pick<PendingMedia, "filePath" | "attempts">>): Promise<void> {
  return queued(async () => {
    const current = await run<StoredMedia | undefined>("readonly", (store) => store.get(id));
    if (!current.value) return;
    await run("readwrite", (store) => store.put({ ...current.value, ...patch }));
  });
}

/** On the server now (or given up with the person told): the phone forgets it. */
export function dropMedia(id: string): Promise<void> {
  return queued(async () => {
    const { ok } = await run("readwrite", (store) => store.delete(id));
    if (ok) changed();
  });
}

/** What this person's phone still owes the server, oldest first. */
export function listMedia(userId: string): Promise<PendingMedia[]> {
  return queued(async () => {
    const { value } = await run<StoredMedia[]>("readonly", (store) => store.getAll());
    return (value ?? [])
      .filter((item) => item.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(fromStored);
  });
}

/** Everything waiting on this phone, whoever's — the send line counts it; the one being sent now is not «waiting». */
export function countMedia(): Promise<number> {
  return queued(async () => {
    const { value } = await run<StoredMedia[]>("readonly", (store) => store.getAll());
    return (value ?? []).filter((item) => !claimed.has(item.id)).length;
  });
}

/** One sender per file inside this tab: the composer's own send and the replay never both upload it. */
const claimed = new Set<string>();

export function claimMedia(id: string): boolean {
  if (claimed.has(id)) return false;
  claimed.add(id);
  return true;
}

export function releaseMedia(id: string): void {
  claimed.delete(id);
}

/** Views redraw (the send line, the composer's strip) — after a round of the replay. */
export function refreshMedia(): void {
  changed();
}

const waitingListeners = new Set<() => void>();

/**
 * The replay listens here, not to every change: a round claims and releases what it carries,
 * and waking on that would start the next round from inside the last one.
 */
export function onMediaHandedOver(listener: () => void): () => void {
  waitingListeners.add(listener);
  return () => {
    waitingListeners.delete(listener);
  };
}

/** The composer could not send it now: the replay takes it from here. */
export function handOverMedia(id: string): void {
  claimed.delete(id);
  changed();
  for (const listener of waitingListeners) listener();
}
