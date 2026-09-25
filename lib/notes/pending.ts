"use client";

/**
 * Notes that have not reached the server yet, kept on the phone (D-95, принцип 5): a
 * thought dictated or typed without network, and an edit made without it. IndexedDB,
 * not localStorage — a recording is a Blob. What lives here survives a closed tab and
 * a PWA the system killed; `lib/notes/replay.ts` sends it once the network is back,
 * under the keys minted at the tap, so a replay of something that did land is harmless.
 *
 * Every call degrades to «nothing kept» where IndexedDB is missing (private mode, an
 * old WebView): the caller then keeps the in-memory path it had before.
 */

export type PendingAudio = { blob: Blob; mime: string; durationMs: number };

/** A note born on the phone: the same id and key it will have on the server. */
export type PendingCreate = {
  id: string;
  userId: string;
  companyId: string;
  /** client_request_id of the row, and of the recording's storage object. */
  crid: string;
  text: string;
  createdAt: string;
  audio: PendingAudio | null;
  /** Set once the recording is in Storage — a retry does not upload it again. */
  audioPath: string | null;
  inboxId: string | null;
  /** A point of a board (D-102): the board and the place on it. Absent in entries kept before boards. */
  boardId?: string | null;
  position?: number | null;
  /** A sub-point (D-121): the point it hangs under; its position is among its siblings. */
  parentId?: string | null;
};

/** A board born on the phone (D-102): it must reach the server before its points do. */
export type PendingBoard = {
  id: string;
  userId: string;
  companyId: string;
  crid: string;
  title: string;
  createdAt: string;
};

export type NoteFields = {
  text?: string;
  pinned?: boolean;
  remind_at?: string | null;
  done_at?: string | null;
  position?: number;
  /** A point moved under another one, or back to the top of its board (D-121). */
  parent_id?: string | null;
};

/** The fields of one note still owed to the server, merged — the latest value of each wins. */
export type PendingEdit = { id: string; userId: string; fields: NoteFields; at: number };

const DB_NAME = "pulse-notes";
const DB_VERSION = 2;
const CREATES = "creates";
const EDITS = "edits";
const BOARDS = "boards";

let opening: Promise<IDBDatabase | null> | null = null;

function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CREATES)) db.createObjectStore(CREATES, { keyPath: "id" });
        if (!db.objectStoreNames.contains(EDITS)) db.createObjectStore(EDITS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(BOARDS)) db.createObjectStore(BOARDS, { keyPath: "id" });
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

/** One request in its own transaction; resolves when the transaction is durable. */
async function run<T>(store: string, mode: IDBTransactionMode, make: (target: IDBObjectStore) => IDBRequest<T>): Promise<{ ok: boolean; value?: T }> {
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
}

const listeners = new Set<() => void>();

/** The screen redraws its «ждёт связи» cards when the store changes. */
export function subscribePending(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function changed() {
  for (const listener of listeners) listener();
}

/* ---------------------------------------------------------------- creates */

/** Keep a new note on the phone. False — nothing was kept (no IndexedDB here). */
export async function keepCreate(entry: PendingCreate): Promise<boolean> {
  const { ok } = await run(CREATES, "readwrite", (store) => store.put(entry));
  if (ok) changed();
  return ok;
}

export async function patchCreate(id: string, fields: Partial<Pick<PendingCreate, "audioPath" | "inboxId" | "text">>): Promise<void> {
  const current = await run<PendingCreate | undefined>(CREATES, "readonly", (store) => store.get(id));
  if (!current.value) return;
  await run(CREATES, "readwrite", (store) => store.put({ ...current.value, ...fields }));
}

/** The row is on the server (or the director gave the recording up): the phone forgets it. */
export async function dropCreate(id: string): Promise<void> {
  const { ok } = await run(CREATES, "readwrite", (store) => store.delete(id));
  if (ok) changed();
}

/** Is this note still only on the phone — e.g. the point a sub-point waits for (D-121)? */
export async function hasCreate(id: string): Promise<boolean> {
  const { value } = await run<PendingCreate | undefined>(CREATES, "readonly", (store) => store.get(id));
  return value !== undefined;
}

/** What this author still owes the server, oldest first. */
export async function listCreates(userId: string): Promise<PendingCreate[]> {
  const { value } = await run<PendingCreate[]>(CREATES, "readonly", (store) => store.getAll());
  return (value ?? []).filter((entry) => entry.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/* ----------------------------------------------------------------- boards */

/** Keep a new board on the phone until the server has it. False — nothing was kept. */
export async function keepBoard(entry: PendingBoard): Promise<boolean> {
  const { ok } = await run(BOARDS, "readwrite", (store) => store.put(entry));
  if (ok) changed();
  return ok;
}

export async function dropBoard(id: string): Promise<void> {
  const { ok } = await run(BOARDS, "readwrite", (store) => store.delete(id));
  if (ok) changed();
}

/** Boards this author still owes the server, oldest first. */
export async function listBoards(userId: string): Promise<PendingBoard[]> {
  const { value } = await run<PendingBoard[]>(BOARDS, "readonly", (store) => store.getAll());
  return (value ?? []).filter((entry) => entry.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/* ------------------------------------------------------------------ edits */

/** Remember fields of a note that are on their way; merged over what was already owed. */
export async function keepEdit(userId: string, id: string, fields: NoteFields): Promise<void> {
  const current = await run<PendingEdit | undefined>(EDITS, "readonly", (store) => store.get(id));
  const merged: PendingEdit = { id, userId, fields: { ...current.value?.fields, ...fields }, at: Date.now() };
  const { ok } = await run(EDITS, "readwrite", (store) => store.put(merged));
  if (ok) changed();
}

/**
 * A write of these values landed: each field is settled only if it still holds the value
 * that was written — a newer edit of the same field stays owed.
 */
export async function settleEdit(id: string, written: NoteFields): Promise<void> {
  const current = await run<PendingEdit | undefined>(EDITS, "readonly", (store) => store.get(id));
  if (!current.value) return;
  const rest: NoteFields = { ...current.value.fields };
  for (const key of Object.keys(written) as (keyof NoteFields)[]) {
    if (rest[key] === written[key]) delete rest[key];
  }
  const { ok } = Object.keys(rest).length === 0
    ? await run(EDITS, "readwrite", (store) => store.delete(id))
    : await run(EDITS, "readwrite", (store) => store.put({ ...current.value, fields: rest }));
  if (ok) changed();
}

export async function listEdits(userId: string): Promise<PendingEdit[]> {
  const { value } = await run<PendingEdit[]>(EDITS, "readonly", (store) => store.getAll());
  return (value ?? []).filter((entry) => entry.userId === userId).sort((a, b) => a.at - b.at);
}

/* ----------------------------------------------------------------- claims */

/**
 * One sender per note at a time inside this tab: the dictaphone delivering a recording
 * and the replay must not both upload and transcribe it (the server would dedupe the
 * row, but STT would be paid twice).
 */
const claimed = new Set<string>();

export function claim(id: string): boolean {
  if (claimed.has(id)) return false;
  claimed.add(id);
  return true;
}

export function release(id: string): void {
  claimed.delete(id);
}
