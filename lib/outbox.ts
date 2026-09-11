/**
 * A persisted outbox for the task routes (DoD «Оффлайн»): a POST that hit a dead network is
 * kept in localStorage under its idempotency key and replayed on the next app start. Inside
 * one session TanStack's paused mutation resumes on its own (QueryProvider, offlineFirst);
 * the outbox is for the case it cannot cover — the tab was closed or the PWA was killed
 * while the tap was still waiting. The server dedupes by client_request_id (принцип 7), so
 * a replay of something that did land is a harmless «duplicate».
 */
const KEY = "pulse.outbox.v1";
/** Older than this the intent is stale: a task may have moved on, the person may have acted. */
const MAX_AGE_MS = 24 * 3_600_000;

export type OutboxEntry = { id: string; path: string; payload: unknown; at: number };

function read(): OutboxEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
    const fresh = list.filter((e) => Date.now() - e.at < MAX_AGE_MS);
    if (fresh.length !== list.length) write(fresh);
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
}

export function outboxSize(): number {
  return typeof window === "undefined" ? 0 : read().length;
}

export function enqueue(entry: Omit<OutboxEntry, "at">): void {
  if (typeof window === "undefined") return;
  const rest = read().filter((e) => e.id !== entry.id);
  write([...rest, { ...entry, at: Date.now() }]);
}

export function dequeue(id: string): void {
  if (typeof window === "undefined") return;
  const rest = read().filter((e) => e.id !== id);
  write(rest);
}

/**
 * Send what is left, oldest first. A network failure keeps the entry; any answer from the
 * server — 2xx, a 409 «уже изменился», a 4xx of any kind — closes it: the server has spoken.
 */
export async function replayOutbox(): Promise<{ sent: number; left: number }> {
  const entries = read();
  let sent = 0;
  for (const entry of entries) {
    try {
      const res = await fetch(entry.path, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entry.payload),
      });
      if (res.status === 401) break; // signed out: nothing more can be replayed now
      dequeue(entry.id);
      if (res.ok) sent += 1;
    } catch {
      break; // still no network: keep this and everything after it
    }
  }
  return { sent, left: read().length };
}
