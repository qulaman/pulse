import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dequeue, enqueue, MAX_AGE_MS, outboxSize, replayOutbox, takeStale } from "./outbox";

/** A browser's localStorage, enough for the outbox. */
function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
  });
  return data;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  stubStorage();
  takeStale();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the outbox", () => {
  it("keeps an entry per key and lets it go by key", () => {
    enqueue({ id: "k1", path: "/api/tasks/t1/transition", payload: { client_request_id: "k1" } });
    enqueue({ id: "k1", path: "/api/tasks/t1/transition", payload: { client_request_id: "k1" } });
    enqueue({ id: "k2", path: "/api/tasks/t2/transition", payload: { client_request_id: "k2" } });
    expect(outboxSize()).toBe(2);
    dequeue("k1");
    expect(outboxSize()).toBe(1);
  });

  it("drops what waited more than a day — and counts it, once, to be said out loud (D-130)", () => {
    vi.useFakeTimers();
    enqueue({ id: "old", path: "/api/tasks/t1/transition", payload: {} });
    vi.advanceTimersByTime(MAX_AGE_MS + 1);
    enqueue({ id: "new", path: "/api/tasks/t2/transition", payload: {} });

    expect(outboxSize()).toBe(1);
    expect(takeStale()).toBe(1);
    expect(takeStale()).toBe(0);
  });
});

describe("replayOutbox", () => {
  it("sends oldest first, closes what landed and brings back the server's words for a refusal", async () => {
    enqueue({ id: "a", path: "/api/tasks/t1/transition", payload: { client_request_id: "a" } });
    enqueue({ id: "b", path: "/api/tasks/t2/transition", payload: { client_request_id: "b" } });
    const fetch = vi.fn()
      .mockResolvedValueOnce(json(200, { result: {}, duplicate: false }))
      .mockResolvedValueOnce(json(409, { error: { code: "invalid_transition", message_ru: "Так нельзя: статус уже изменился" } }));
    vi.stubGlobal("fetch", fetch);

    const result = await replayOutbox();

    expect(fetch.mock.calls.map((call) => call[0])).toEqual(["/api/tasks/t1/transition", "/api/tasks/t2/transition"]);
    expect(result).toEqual({ sent: 1, left: 0, refused: ["Так нельзя: статус уже изменился"] });
  });

  it("a server that failed (5xx) did not refuse: the entry waits for the next start", async () => {
    enqueue({ id: "a", path: "/api/tasks/t1/transition", payload: {} });
    enqueue({ id: "b", path: "/api/tasks/t2/transition", payload: {} });
    const fetch = vi.fn().mockResolvedValue(json(503, {}));
    vi.stubGlobal("fetch", fetch);

    const result = await replayOutbox();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: 0, left: 2, refused: [] });
  });

  it("still no network: everything stays, in order", async () => {
    enqueue({ id: "a", path: "/api/tasks/t1/transition", payload: {} });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    expect(await replayOutbox()).toEqual({ sent: 0, left: 1, refused: [] });
  });

  it("signed out: nothing more is tried", async () => {
    enqueue({ id: "a", path: "/api/tasks/t1/transition", payload: {} });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(401, {})));

    expect((await replayOutbox()).left).toBe(1);
  });

  it("a message that did land (duplicate id) counts as sent; another refusal is said", async () => {
    enqueue({ id: "m1", kind: "message", path: "task_messages", payload: { id: "m1" } });
    enqueue({ id: "m2", kind: "message", path: "task_messages", payload: { id: "m2" } });
    const write = vi.fn()
      .mockResolvedValueOnce({ error: { message: 'duplicate key value violates unique constraint "task_messages_pkey"' } })
      .mockResolvedValueOnce({ error: { message: "new row violates row-level security policy" } });

    const result = await replayOutbox(write);

    expect(result).toEqual({ sent: 1, left: 0, refused: ["сообщение не прошло"] });
  });
});
