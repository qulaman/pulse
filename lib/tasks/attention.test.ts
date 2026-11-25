import { describe, expect, it } from "vitest";

import { ACCEPT_GRACE_MS, attentionOf, isDeadlineSoon, isStaleUnaccepted, noPushIds, taskAttention, type AttentionTask } from "./attention";
import type { DeskReason } from "./reasons";
import type { TaskStatus } from "./status-text";

// 2026-09-17 12:00 Aqtobe (UTC+5)
const NOW = new Date("2026-09-17T07:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

let seq = 0;
function task(status: TaskStatus, extra: Partial<AttentionTask> = {}): AttentionTask {
  seq += 1;
  return {
    id: `t-${seq}`,
    title: `Задача ${seq}`,
    status,
    deadline: null,
    created_at: minutesAgo(5),
    scheduled_send_at: null,
    assignee_id: "marat",
    assignee: { full_name: "Марат Оспанов" },
    ...extra,
  };
}

describe("taskAttention", () => {
  it("closed, held and calm work needs nothing", () => {
    for (const status of ["done", "revoked", "scheduled", "accepted"] as const) expect(taskAttention(task(status), { now: NOW })).toBeNull();
    expect(taskAttention(task("sent"), { now: NOW })).toBeNull();
  });

  it("an order untaken for half an hour — counted from the send, not the creation of a held one", () => {
    expect(taskAttention(task("sent", { created_at: minutesAgo(29) }), { now: NOW })).toBeNull();
    expect(taskAttention(task("sent", { created_at: minutesAgo(30) }), { now: NOW })).toBe("unaccepted");
    // held overnight, sent ten minutes ago: still inside the grace
    expect(taskAttention(task("sent", { created_at: minutesAgo(900), scheduled_send_at: minutesAgo(10) }), { now: NOW })).toBeNull();
    expect(ACCEPT_GRACE_MS).toBe(30 * 60_000);
  });

  it("pushes that do not reach the holder: at once, and only while the order is not taken", () => {
    const noPush = new Set(["marat"]);
    expect(taskAttention(task("sent"), { now: NOW, noPush })).toBe("no_push");
    expect(taskAttention(task("accepted"), { now: NOW, noPush })).toBeNull();
    expect(taskAttention(task("sent", { assignee_id: "other" }), { now: NOW, noPush })).toBeNull();
  });

  it("the deadline: past is overdue, within the hour is soon", () => {
    expect(taskAttention(task("accepted", { deadline: minutesAgo(1) }), { now: NOW })).toBe("overdue");
    expect(taskAttention(task("accepted", { deadline: inMinutes(59) }), { now: NOW })).toBe("soon");
    expect(taskAttention(task("accepted", { deadline: inMinutes(61) }), { now: NOW })).toBeNull();
    // handed-in work has met its deadline
    expect(isDeadlineSoon(task("pending_review", { deadline: inMinutes(10) }), NOW)).toBe(false);
  });

  it("what waits for the director's decision", () => {
    expect(taskAttention(task("pending_review"), { now: NOW })).toBe("decision");
    expect(taskAttention(task("declined"), { now: NOW })).toBe("decision");
    expect(taskAttention(task("accepted", { question: "Какой адрес?" }), { now: NOW })).toBe("decision");
    expect(taskAttention(task("accepted", { time_request: { proposed: inMinutes(600) } }), { now: NOW })).toBe("decision");
  });

  it("the screen's own «Ждут вас» map wins over the row's fields", () => {
    const asked = task("accepted");
    const reasons = new Map<string, DeskReason>([[asked.id, "question"]]);
    expect(taskAttention(asked, { now: NOW, reasons })).toBe("decision");
    // an empty map: the screen knows nothing waits — the deadline rules still apply
    expect(taskAttention(task("pending_review"), { now: NOW, reasons: new Map() })).toBeNull();
    expect(taskAttention(task("sent", { created_at: minutesAgo(40) }), { now: NOW, reasons: new Map() })).toBe("unaccepted");
  });
});

describe("attentionOf", () => {
  it("ok only when nothing needs the director", () => {
    const verdict = attentionOf([task("accepted"), task("sent"), task("done")], { now: NOW });
    expect(verdict).toMatchObject({ ok: true, tone: "ok", items: [], words: null, action: null });
  });

  it("names the one task and its age in words, and offers «Напомнить»", () => {
    const stale = task("sent", { title: "Тест", created_at: "2026-09-16T12:40:00Z" });
    const verdict = attentionOf([stale, task("accepted")], { now: NOW });
    expect(verdict.ok).toBe(false);
    expect(verdict.tone).toBe("warn");
    expect(verdict.words).toBe("Тест · не принята с вчера 17:40");
    expect(verdict.action).toBe("nudge");
    expect(verdict.items).toEqual([{ id: stale.id, reason: "unaccepted" }]);
  });

  it("loudest first; the rest is counted, not listed", () => {
    const late = task("accepted", { title: "Акт", deadline: minutesAgo(60) });
    const stale = task("sent", { created_at: minutesAgo(45) });
    const cut = task("sent", { assignee_id: "erlan", assignee: { full_name: "Ерлан Б" } });
    const verdict = attentionOf([stale, cut, late], { now: NOW, noPush: new Set(["erlan"]) });
    expect(verdict.items.map((item) => item.reason)).toEqual(["overdue", "no_push", "unaccepted"]);
    expect(verdict.tone).toBe("danger");
    expect(verdict.words).toBe("Акт · просрочена · ещё 2 требуют внимания");
    expect(verdict.counts).toEqual({ overdue: 1, decision: 0, soon: 0, no_push: 1, unaccepted: 1 });
  });

  it("several of one reason are a count; pushes name the people", () => {
    const a = task("sent", { created_at: minutesAgo(45) });
    const b = task("sent", { created_at: minutesAgo(50) });
    expect(attentionOf([a, b], { now: NOW }).words).toBe("2 не приняты дольше 30 мин");
    const c = task("sent", { assignee_id: "aigul", assignee: { full_name: "Айгуль Н" } });
    expect(attentionOf([task("sent"), c], { now: NOW, noPush: new Set(["marat", "aigul"]) }).words).toBe("уведомления не доходят: Марат, Айгуль");
    expect(attentionOf([c], { now: NOW, noPush: new Set(["aigul"]) }).action).toBe("call");
  });

  it("a deadline within the hour: how much is left (the time itself is the screen's foot)", () => {
    const soon = task("accepted", { title: "Акт сверки", deadline: inMinutes(40) });
    expect(attentionOf([soon], { now: NOW })).toMatchObject({ words: "Акт сверки · осталось 40 мин", action: "nudge", tone: "warn" });
  });

  it("a long title is cut at a word", () => {
    const long = task("sent", { title: "Подготовить коммерческое предложение для Казхрома с ценами", created_at: minutesAgo(40) });
    expect(attentionOf([long], { now: NOW }).words).toBe("Подготовить коммерческое… · не принята с 11:20");
  });

  it("one task counts once", () => {
    const stale = task("sent", { created_at: minutesAgo(40) });
    expect(attentionOf([stale, stale], { now: NOW }).items).toHaveLength(1);
  });
});

describe("isStaleUnaccepted / noPushIds", () => {
  it("stale is the same half hour as the verdict", () => {
    expect(isStaleUnaccepted(task("sent", { created_at: minutesAgo(31) }), NOW)).toBe(true);
    expect(isStaleUnaccepted(task("accepted", { created_at: minutesAgo(310) }), NOW)).toBe(false);
  });

  it("off and broken channels are cut off; ok and idle are not", () => {
    const health = new Map([
      ["a", { state: "off" as const, text: "" }],
      ["b", { state: "broken" as const, text: "" }],
      ["c", { state: "ok" as const, text: "" }],
      ["d", { state: "idle" as const, text: "" }],
    ]);
    expect([...noPushIds(health)].sort()).toEqual(["a", "b"]);
    expect(noPushIds(undefined).size).toBe(0);
  });
});
