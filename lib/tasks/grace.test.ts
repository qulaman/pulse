import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { outboxSize, release, replayOutbox } from "@/lib/outbox";

// the toast is the window's face: catch its words and its «Отменить»
const { shown, dismissed } = vi.hoisted(() => ({
  shown: [] as { text: string; undo?: () => void; id: number }[],
  dismissed: [] as number[],
}));
vi.mock("@/components/ui/Toast", () => ({
  toast: (text: string, options?: { action?: { onClick: () => void } }) => {
    const id = shown.length + 1;
    shown.push({ text, undo: options?.action?.onClick, id });
    return id;
  },
  dismissToast: (id: number) => void dismissed.push(id),
}));

const { flushHolds, holdForUndo, UNDO_MS, Undone, wasUndone } = await import("./grace");

/** A browser enough for the outbox and the window's listeners. */
function stubBrowser() {
  const data = new Map<string, string>();
  const listeners = new Map<string, () => void>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
    addEventListener: (name: string, fn: () => void) => void listeners.set(name, fn),
  });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: (name: string, fn: () => void) => void listeners.set(name, fn) });
  return data;
}

const input = (id: string) => ({ id, path: `/api/tasks/t-${id}/transition`, payload: { to_status: "done", client_request_id: id }, taskId: `t-${id}`, text: "Принято · Ерлан" });

beforeEach(() => {
  stubBrowser();
  shown.length = 0;
  dismissed.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  flushHolds();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("«Отменить» (D-139)", () => {
  it("lets the call go once the window is over, with the receipt and its button on screen meanwhile", async () => {
    let gone = false;
    const held = holdForUndo(input("a")).then(() => (gone = true));
    expect(shown.map((t) => t.text)).toEqual(["Принято · Ерлан"]);
    expect(typeof shown[0]!.undo).toBe("function");
    await vi.advanceTimersByTimeAsync(UNDO_MS - 1);
    expect(gone).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await held;
    expect(gone).toBe(true);
    expect(dismissed).toEqual([shown[0]!.id]);
  });

  it("taken back: the call never goes, the phone forgets it, the board coming back is not news", async () => {
    const held = holdForUndo(input("b"));
    shown[0]!.undo!();
    await expect(held).rejects.toBeInstanceOf(Undone);
    expect(outboxSize()).toBe(0);
    expect(wasUndone("t-b")).toBe(true);
    expect(wasUndone("t-other")).toBe(false);
    // later on, the task is news again
    expect(wasUndone("t-b", Date.now() + 10_000)).toBe(false);
  });

  it("an «Отменить» tapped after the window is over changes nothing", async () => {
    const held = holdForUndo(input("c"));
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    await held;
    shown[0]!.undo!();
    expect(wasUndone("t-c")).toBe(false);
  });

  it("a retry after a dead network goes straight out — the window was had once", async () => {
    const first = holdForUndo(input("r"));
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    await first;
    let again = false;
    await holdForUndo(input("r")).then(() => (again = true));
    expect(again).toBe(true);
    expect(shown).toHaveLength(1);
  });

  it("another tab's window is respected too: its tap is neither counted nor replayed here (D-142)", async () => {
    // the channel delivers on the real event loop
    vi.useRealTimers();
    const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
    // this tab opens the shared channel with a window of its own
    const mine = holdForUndo(input("own"));
    // the other tab of the same browser: its tap sits in the shared outbox, its window announced
    const other = new BroadcastChannel("pulse-outbox");
    window.localStorage.setItem(
      "pulse.outbox.v1",
      JSON.stringify([
        ...JSON.parse(window.localStorage.getItem("pulse.outbox.v1") ?? "[]"),
        { id: "theirs", path: "/api/tasks/t9/transition", payload: { client_request_id: "theirs" }, at: Date.now() },
      ]),
    );
    other.postMessage({ type: "hold", id: "theirs", until: Date.now() + 30_000 });
    await tick();
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(outboxSize()).toBe(0);
    expect((await replayOutbox()).sent).toBe(0);
    // their window is over: here it is an ordinary tap again
    other.postMessage({ type: "release", id: "theirs" });
    await tick();
    expect(outboxSize()).toBe(1);
    other.close();
    shown[0]!.undo!();
    await expect(mine).rejects.toBeInstanceOf(Undone);
  });

  it("leaving the app sends whatever waits at once", async () => {
    let gone = 0;
    void holdForUndo(input("d")).then(() => (gone += 1));
    void holdForUndo(input("e")).then(() => (gone += 1));
    flushHolds();
    await vi.advanceTimersByTimeAsync(0);
    expect(gone).toBe(2);
  });

  it("waits on the phone for a closed app, but is neither counted as waiting nor replayed while the window is open", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const held = holdForUndo(input("f"));
    expect(window.localStorage.getItem("pulse.outbox.v1")).toContain('"id":"f"');
    expect(outboxSize()).toBe(0);
    expect((await replayOutbox()).sent).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    // the window is over and the call is on its way: still unseen, still not replayed
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    await held;
    expect(outboxSize()).toBe(0);
    expect((await replayOutbox()).sent).toBe(0);
    // the call hit a dead network (postJson releases it): now it really waits, and is replayed
    release("f");
    expect(outboxSize()).toBe(1);
    expect((await replayOutbox()).sent).toBe(1);
    expect(outboxSize()).toBe(0);
  });
});
