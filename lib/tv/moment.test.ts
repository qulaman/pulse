import { describe, expect, it } from "vitest";

import type { TvLine } from "./feed";
import { MOMENT_MS, momentOf, QUEUE_MS } from "./moment";

const NOW = new Date("2026-11-20T07:00:00Z");
/** The kiosk's clock this many ms after NOW. */
const later = (ms: number) => new Date(NOW.getTime() + ms);

function line(id: string, kind: TvLine["kind"], agoMs: number, extra: Partial<TvLine> = {}): TvLine {
  return {
    id,
    kind,
    name: "Марат Ахметов",
    label: kind,
    detail: "Сдал объект «Север» на день раньше",
    amount: kind === "points" ? 50 : null,
    tone: "gold",
    at: new Date(NOW.getTime() - agoMs),
    ...extra,
  };
}

/** Which moment holds the wall at each of these offsets from NOW. */
function shown(lines: readonly TvLine[], offsets: number[], guest = false): (string | null)[] {
  return offsets.map((ms) => momentOf(lines, later(ms), guest)?.id ?? null);
}

describe("momentOf", () => {
  it("shows fresh praise with its points and reason", () => {
    const moment = momentOf([line("p1", "points", 3_000)], NOW, false);
    expect(moment).toMatchObject({ id: "p1", kind: "points", amount: 50, name: "Марат Ахметов" });
  });

  it("lets the moment go once it has held the wall for MOMENT_MS", () => {
    expect(momentOf([line("p1", "points", MOMENT_MS)], NOW, false)).toBeNull();
    expect(momentOf([line("p1", "points", MOMENT_MS - 1)], NOW, false)).not.toBeNull();
  });

  it("never makes a moment of a closed task or a new order", () => {
    const kinds = ["task_done", "task_sent", "task_accepted", "task_review", "event"] as const;
    expect(momentOf(kinds.map((kind, i) => line(`t${i}`, kind, 1_000)), NOW, false)).toBeNull();
  });

  it("has no moments with a guest in the office (D-33)", () => {
    const queue = [line("p1", "points", 1_000), line("m1", "merch", 500), line("a1", "announcement", 0)];
    expect(shown(queue, [0, 10_000, 30_000, 60_000], true)).toEqual([null, null, null, null]);
  });

  it("tolerates a kiosk clock a little behind the base", () => {
    expect(momentOf([line("p1", "points", -3_000)], NOW, false)).not.toBeNull();
    expect(momentOf([line("p1", "points", -60_000)], NOW, false)).toBeNull();
  });
});

describe("momentOf — очередь моментов (D-185)", () => {
  it("two in a row are both shown, the earlier first, the later right after it — each for its full time", () => {
    // the feed comes newest first; the queue goes in time order
    const queue = [line("m1", "merch", 2_000), line("a1", "announcement", 9_000)];
    const aEnds = MOMENT_MS - 9_000;
    expect(shown(queue, [0, aEnds - 1, aEnds, aEnds + MOMENT_MS - 1, aEnds + MOMENT_MS])).toEqual(["a1", "a1", "m1", "m1", null]);
    expect(momentOf(queue, later(aEnds), false)).toMatchObject({ kind: "merch", amount: null });
  });

  it("a later moment never cuts off the one on the wall", () => {
    const first = line("p1", "points", 20_000);
    // a second praise lands while the first is on the wall: the first keeps its last seconds
    const second = line("p2", "points", 0);
    expect(momentOf([second, first], NOW, false)?.id).toBe("p1");
    expect(momentOf([second, first], later(MOMENT_MS - 20_000 - 1), false)?.id).toBe("p1");
    expect(momentOf([second, first], later(MOMENT_MS - 20_000), false)?.id).toBe("p2");
  });

  it("a third waits for the second", () => {
    const queue = [line("p3", "points", 6_000), line("p2", "merch", 8_000), line("p1", "announcement", 10_000)];
    const p1Ends = MOMENT_MS - 10_000;
    const p2Ends = p1Ends + MOMENT_MS;
    const p3Ends = p2Ends + MOMENT_MS;
    expect(shown(queue, [0, p1Ends, p2Ends - 1, p2Ends, p3Ends - 1, p3Ends])).toEqual(["p1", "p2", "p2", "p3", "p3", null]);
  });

  it("orders, closed tasks and meetings do not hold a place in the queue", () => {
    const queue = [line("p2", "points", 8_000), line("t1", "task_done", 9_000), line("e1", "event", 9_500), line("p1", "points", 10_000)];
    expect(shown(queue, [0, MOMENT_MS - 10_000])).toEqual(["p1", "p2"]);
  });

  it("an event older than QUEUE_MS is skipped: it had its turn or is no longer news", () => {
    expect(momentOf([line("old", "points", QUEUE_MS)], NOW, false)).toBeNull();
    // ten awards at once: the tenth comes on 225 s later, still within the queue's reach
    const burst = Array.from({ length: 11 }, (_, k) => line(`b${String(k).padStart(2, "0")}`, "announcement", 0));
    expect(momentOf(burst, later(9 * MOMENT_MS), false)?.id).toBe("b09");
    // the eleventh's turn would come after QUEUE_MS: by then it is not news, the wall skips it
    expect(10 * MOMENT_MS).toBeGreaterThanOrEqual(QUEUE_MS);
    expect(momentOf(burst, later(10 * MOMENT_MS), false)).toBeNull();
    expect(momentOf(burst, later(10 * MOMENT_MS + MOMENT_MS - 1), false)).toBeNull();
  });

  it("a stale backlog does not hold back a fresh moment", () => {
    // twelve awards stamped 4 min 10 s ago would, queued, fill the wall until 50 s from now
    const stale = Array.from({ length: 12 }, (_, k) => line(`s${String(k).padStart(2, "0")}`, "merch", QUEUE_MS + 10_000));
    const queue = [line("fresh", "points", 1_000), ...stale];
    expect(momentOf(queue, NOW, false)?.id).toBe("fresh");
  });

  it("a kiosk a few seconds behind still queues an event stamped «in the future»", () => {
    const queue = [line("p2", "points", -3_000), line("p1", "points", 10_000)];
    expect(shown(queue, [0, MOMENT_MS - 10_000])).toEqual(["p1", "p2"]);
  });

  it("the same instant gives the same moment — a kiosk that reloads finds it on the wall", () => {
    const queue = [line("b", "points", 1_000), line("a", "points", 1_000)];
    expect(shown(queue, [0, MOMENT_MS])).toEqual(["a", "b"]);
    expect(shown([...queue].reverse(), [0, MOMENT_MS])).toEqual(["a", "b"]);
  });
});
