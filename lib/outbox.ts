/**
 * A persisted outbox for the task routes (DoD «Оффлайн»): a POST that hit a dead network is
 * kept in localStorage under its idempotency key and replayed on the next app start. Inside
 * one session TanStack's paused mutation resumes on its own (QueryProvider, offlineFirst);
 * the outbox is for the case it cannot cover — the tab was closed or the PWA was killed
 * while the tap was still waiting. The server dedupes by client_request_id (принцип 7), so
 * a replay of something that did land is a harmless «duplicate».
 *
 * Nothing leaves it silently (D-130): a tap the server refused on the replay, and one that
 * waited too long to still mean anything, are told to the person who made it.
 */
const KEY = "pulse.outbox.v1";
/** Older than this the intent is stale: a task may have moved on, the person may have acted. */
export const MAX_AGE_MS = 24 * 3_600_000;

export type OutboxEntry = {
  id: string;
  /** `post` — a task route (path + JSON body); `message` — a task_messages row inserted through supabase-js. */
  kind?: "post" | "message";
  path: string;
  payload: unknown;
  at: number;
};

/** How a `message` entry is written on replay — supabase-js lives in the browser bundle, not here. */
export type MessageWriter = (row: unknown) => Promise<{ error: { message: string } | null }>;

/** Entries dropped for age since the replay last asked — the replay says so once (D-130). */
let stale = 0;

/**
 * Entries inside an «Отменить» window of this very session (lib/tasks/grace.ts, D-139): kept
 * here so a closed app still sends them on the next start, but not sent by the replay and not
 * counted as waiting — the tap has not been let go yet. A new session starts with none, so
 * what a closed app left behind goes out like any other entry.
 */
const held = new Set<string>();

/**
 * Entries another tab of this browser holds in its window (D-142): two tabs share one outbox,
 * and the other tab's replay (its start, a reconnect) used to send a tap before its «Отменить»
 * was over. A tab says so over a BroadcastChannel; the hold expires on its own, so the tap of a
 * tab that died mid-window still goes out from here afterwards.
 */
const heldElsewhere = new Map<string, number>();
/** A window and the call after it fit well inside this; past it the other tab is gone. */
const ELSEWHERE_MS = 30_000;
let channel: BroadcastChannel | null | undefined;

function bus(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  try {
    channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("pulse-outbox");
  } catch {
    channel = null;
  }
  // under Node (tests) an open channel would keep the process alive
  (channel as { unref?: () => void } | null)?.unref?.();
  channel?.addEventListener("message", (event: MessageEvent<{ type?: string; id?: string; until?: number }>) => {
    const { type, id, until } = event.data ?? {};
    if (!id) return;
    if (type === "hold" && until) heldElsewhere.set(id, until);
    else if (type === "release") heldElsewhere.delete(id);
    for (const listener of listeners) listener();
  });
  return channel;
}
// every tab listens from its first import, before anybody else has a window to announce
if (typeof window !== "undefined") bus();

function say(type: "hold" | "release", id: string) {
  try {
    bus()?.postMessage(type === "hold" ? { type, id, until: Date.now() + ELSEWHERE_MS } : { type, id });
  } catch {
    // a closed channel: the expiry covers it
  }
}

/** Not to be sent from here right now: in this tab's window, or in another tab's. */
function isHeld(id: string): boolean {
  if (held.has(id)) return true;
  const until = heldElsewhere.get(id);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  heldElsewhere.delete(id);
  return false;
}

const listeners = new Set<() => void>();

/** The send line counts what waits here (components/OfflineBanner.tsx). */
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(): OutboxEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
    const fresh = list.filter((e) => Date.now() - e.at < MAX_AGE_MS);
    if (fresh.length !== list.length) {
      stale += list.length - fresh.length;
      write(fresh);
    }
    return fresh;
  } catch {
    return [];
  }
}

function write(entries: OutboxEntry[]): void {
  try {
    if (entries.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // private mode or a full store: the in-session pause still covers the tap
  }
  for (const listener of listeners) listener();
}

export function outboxSize(): number {
  return typeof window === "undefined" ? 0 : read().filter((e) => !isHeld(e.id)).length;
}

export function enqueue(entry: Omit<OutboxEntry, "at">): void {
  if (typeof window === "undefined") return;
  const rest = read().filter((e) => e.id !== entry.id);
  write([...rest, { ...entry, at: Date.now() }]);
}

export function dequeue(id: string): void {
  if (typeof window === "undefined") return;
  if (held.delete(id)) say("release", id);
  const all = read();
  const rest = all.filter((e) => e.id !== id);
  if (rest.length !== all.length) write(rest);
}

/** A tap inside its «Отменить» window (D-139): on the phone already, not yet to be sent. */
export function hold(entry: Omit<OutboxEntry, "at">): void {
  held.add(entry.id);
  say("hold", entry.id);
  enqueue(entry);
}

/** The window is over: the entry is an ordinary one now — the call goes out and closes it. */
export function release(id: string): void {
  if (!held.delete(id)) return;
  say("release", id);
  for (const listener of listeners) listener();
}

/** How many entries went for age since the last call; the count starts over. */
export function takeStale(): number {
  const count = stale;
  stale = 0;
  return count;
}

const DEAD_NETWORK = /failed to fetch|networkerror|network request failed|load failed|fetch failed/i;

/** The server's own words for a refusal (lib/api/respond.ts), when it gave any. */
async function refusalOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message_ru?: unknown } } | null;
    if (typeof body?.error?.message_ru === "string") return body.error.message_ru;
  } catch {
    // no body: the status says enough
  }
  return "сервер не принял";
}

export type ReplayResult = {
  sent: number;
  left: number;
  /** The server's words for each tap it refused — shown to the person, never swallowed. */
  refused: string[];
};

/**
 * Send what is left, oldest first. A dead network or a server that failed (5xx) keeps the
 * entry for the next start; a 2xx closes it, and so does a 4xx — the server has spoken, and
 * its words go back to the caller to be shown.
 */
export async function replayOutbox(writeMessage?: MessageWriter): Promise<ReplayResult> {
  const entries = read();
  const result: ReplayResult = { sent: 0, left: 0, refused: [] };
  for (const entry of entries) {
    // still inside its «Отменить» window, here or in another tab: the person may yet take it back
    if (isHeld(entry.id)) continue;
    if (entry.kind === "message") {
      if (!writeMessage) continue;
      const { error } = await writeMessage(entry.payload);
      if (error && DEAD_NETWORK.test(error.message)) break;
      dequeue(entry.id);
      // a duplicate id is the row that did land — its answer was what got lost
      if (!error || /duplicate key/i.test(error.message)) result.sent += 1;
      else result.refused.push("сообщение не прошло");
      continue;
    }
    let res: Response;
    try {
      res = await fetch(entry.path, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
    } catch {
      break; // still no network: keep this and everything after it
    }
    if (res.status === 401) break; // signed out: nothing more can be replayed now
    if (res.status >= 500) break; // the server failed, it did not refuse: the next start tries again
    dequeue(entry.id);
    if (res.ok) result.sent += 1;
    else result.refused.push(await refusalOf(res));
  }
  result.left = read().filter((e) => !isHeld(e.id)).length;
  return result;
}
