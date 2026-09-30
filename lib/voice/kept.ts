/**
 * The director's phrase, kept on the phone from the moment the finger leaves the face until
 * the batch is away (principle 5, D-130). The pipeline used to live only in the page's memory:
 * a PWA the system killed, a tab closed on the board, a network lost at the release — and the
 * words were gone. Now every step is written down here — the recording before any network
 * call, the words once heard, the cards once parsed and every edit of them, the batch the
 * director threw without network — and a phrase nobody is carrying any more (the app died, the
 * network went) is picked up by the replay (./keptReplay.ts) and comes back to the director.
 *
 * IndexedDB, not localStorage: a recording is a Blob. Every call degrades to «nothing kept»
 * where IndexedDB is missing (private mode, an old WebView) — the caller then keeps the
 * in-memory path it had before.
 */

import type { PostprocessedEntity } from "../ai/postprocess";
import type { ConfirmRequest, IngestSource, ParseResponse } from "./api";

/**
 * How far the phrase got: `recorded` — the audio, maybe in Storage already (`audioPath`);
 * `heard` — the words (typed ones start here); `parsed` — the cards, waiting for the director's
 * tap; `sending` — the director threw them, the batch (`confirm`) waits for the network.
 */
export type KeptStage = "recorded" | "heard" | "parsed" | "sending";

/** The server said no for good (not «no network»): the phrase waits for the director. */
export type KeptFailure = { code: string; message?: string };

export type KeptPhrase = {
  /** The first client_request_id of the phrase; stays when a correction mints a new key. */
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: number;
  /** The idempotency key of the current step (principle 7). */
  crid: string;
  source: IngestSource;
  audio: { blob: Blob; mime: string; durationMs: number } | null;
  audioPath: string | null;
  inboxId: string | null;
  transcript: string;
  address: string | null;
  pinned: { id: string; name: string } | null;
  toSecretary: boolean;
  suspicious: boolean;
  stage: KeptStage;
  /** The cards as the director left them (edits included). */
  entities: PostprocessedEntity[];
  /** The parser's own output — the «share of edits» diff (D-35) needs it at send time. */
  parsedEntities: PostprocessedEntity[];
  /** «Кофе» caught by the matcher (D-79): a request to the secretary, not a card. */
  errand: ParseResponse["errand"] | null;
  confirm: ConfirmRequest | null;
  failure: KeptFailure | null;
  /** Failed tries of the replay that were not «no network». */
  attempts: number;
};

const DB_NAME = "pulse-voice";
const DB_VERSION = 1;
const PHRASES = "phrases";

let opening: Promise<IDBDatabase | null> | null = null;

function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PHRASES)) db.createObjectStore(PHRASES, { keyPath: "id" });
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
async function run<T>(mode: IDBTransactionMode, make: (target: IDBObjectStore) => IDBRequest<T>): Promise<{ ok: boolean; value?: T }> {
  const db = await database();
  if (!db) return { ok: false };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PHRASES, mode);
      const request = make(tx.objectStore(PHRASES));
      tx.oncomplete = () => resolve({ ok: true, value: request.result });
      tx.onerror = () => resolve({ ok: false });
      tx.onabort = () => resolve({ ok: false });
    } catch {
      resolve({ ok: false });
    }
  });
}

/**
 * Every read and write goes through one line: a patch is read-modify-write, and the store
 * patches a phrase several times a second (upload → words → cards → an edit). In a line the
 * last word always wins and a reader never sees a step before the one written ahead of it.
 */
let line: Promise<unknown> = Promise.resolve();
function queued<T>(step: () => Promise<T>): Promise<T> {
  const next = line.then(step, step);
  line = next.catch(() => undefined);
  return next;
}

const listeners = new Set<() => void>();

/** The pill and the replay redraw when the phone's list changes. */
export function subscribeKept(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function changed() {
  for (const listener of listeners) listener();
}

/** Keep a new phrase on the phone. False — nothing was kept (no IndexedDB here). */
export function keepPhrase(entry: KeptPhrase): Promise<boolean> {
  return queued(async () => {
    const { ok } = await run("readwrite", (store) => store.put(entry));
    if (ok) changed();
    return ok;
  });
}

/** One more step of the phrase; the phrase as it is now, or null when the phone has none. */
export function patchPhrase(id: string, patch: Partial<Omit<KeptPhrase, "id" | "userId">>): Promise<KeptPhrase | null> {
  return queued(async () => {
    const current = await run<KeptPhrase | undefined>("readonly", (store) => store.get(id));
    if (!current.value) return null;
    const next: KeptPhrase = { ...current.value, ...patch, updatedAt: Date.now() };
    const { ok } = await run("readwrite", (store) => store.put(next));
    if (ok) changed();
    return ok ? next : null;
  });
}

/** The batch is on the server, or the director let the phrase go: the phone forgets it. */
export function dropPhrase(id: string): Promise<void> {
  return queued(async () => {
    const { ok } = await run("readwrite", (store) => store.delete(id));
    if (ok) changed();
  });
}

/** What this director's phone still holds, oldest first. */
export function listPhrases(userId: string): Promise<KeptPhrase[]> {
  return queued(async () => {
    const { value } = await run<KeptPhrase[]>("readonly", (store) => store.getAll());
    return (value ?? []).filter((entry) => entry.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}

/**
 * Phrases on their way by themselves, whoever's they are on this phone — the send line counts
 * them. The one the face carries right now is not «waiting»: it is simply being sent.
 */
export function countOnTheirWay(): Promise<number> {
  return queued(async () => {
    const { value } = await run<KeptPhrase[]>("readonly", (store) => store.getAll());
    return (value ?? []).filter((entry) => !isReady(entry) && !claimed.has(entry.id)).length;
  });
}

/* ----------------------------------------------------------------- claims */

/**
 * One carrier per phrase inside this tab: the live pipeline (the phrase on the face right now)
 * and the replay must not both upload, hear or send it — the server would dedupe the batch by
 * its key, but STT and the parser would be paid twice.
 */
const claimed = new Set<string>();

export function claimPhrase(id: string): boolean {
  if (claimed.has(id)) return false;
  claimed.add(id);
  return true;
}

export function releasePhrase(id: string): void {
  claimed.delete(id);
}

/**
 * Phrases this tab parked for want of network: when the replay has their cards, it brings them
 * back to the face on its own — the director saw «разберу, как появится сеть» and is waiting.
 * A phrase left by a dead app comes back only by a tap on the pill.
 */
const parked = new Set<string>();

export function markParked(id: string): void {
  parked.add(id);
  // handed from the face to the replay: the send line and the pill count it from now on
  changed();
}

export function wasParkedHere(id: string): boolean {
  return parked.has(id);
}

export function forgetParked(id: string): void {
  parked.delete(id);
}

/* ------------------------------------------------------------------- view */

/**
 * What the pill says: a phrase that waits for the director (its cards, or a failure) outranks
 * the ones on their way — the director can act on the first, the others go by themselves.
 */
export type KeptView =
  | { kind: "ready"; phrase: KeptPhrase; more: number }
  | { kind: "waiting"; count: number }
  | null;

/** A phrase the director has to look at: parsed cards, or a step the server refused for good. */
export function isReady(phrase: KeptPhrase): boolean {
  return phrase.failure !== null || phrase.stage === "parsed";
}

/** `live` — the phrase on the face right now: it is the face's business, not the pill's. */
export function keptView(phrases: readonly KeptPhrase[], live: string | null): KeptView {
  const rest = phrases.filter((phrase) => phrase.id !== live);
  const ready = rest.filter(isReady);
  if (ready.length > 0) return { kind: "ready", phrase: ready[0], more: ready.length - 1 };
  return rest.length > 0 ? { kind: "waiting", count: rest.length } : null;
}
