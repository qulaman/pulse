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
import { idbStore } from "@/lib/offline/idb";

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

const ITEMS = "items";
/** The phones' database — its name, version and store never change (lib/offline/idb.ts). */
const db = idbStore("pulse-media", 1, [ITEMS]);

function run<T>(mode: IDBTransactionMode, make: (target: IDBObjectStore) => IDBRequest<T>): Promise<{ ok: boolean; value?: T }> {
  return db.run(ITEMS, mode, make);
}

/** Reads and writes in one line: a patch is read-modify-write. */
const { queued, changed } = db;

export const subscribeMedia: (listener: () => void) => () => void = db.subscribe;

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
    return (value ?? []).filter((item) => !db.isClaimed(item.id)).length;
  });
}

/** One sender per file inside this tab: the composer's own send and the replay never both upload it. */
export function claimMedia(id: string): boolean {
  return db.claim(id);
}

export function releaseMedia(id: string): void {
  db.release(id);
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
  db.release(id);
  changed();
  for (const listener of waitingListeners) listener();
}
