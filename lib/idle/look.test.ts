import { describe, expect, it } from "vitest";

import { lookOf, toneFor, urgencyOf, wordOf, type CrewTask } from "@/lib/idle/look";

const task = (patch: Partial<CrewTask>): CrewTask => ({
  id: "t",
  title: "Задача",
  status: "accepted",
  overdue: false,
  question: null,
  unread: false,
  reason: null,
  href: "/tasks/t",
  ...patch,
});

describe("team look", () => {
  it("keeps an idler below, grey and still", () => {
    expect(lookOf([])).toMatchObject({ busy: false, ring: "idle" });
  });

  it("spins while the work is done, waits before it is taken up, closes when handed in", () => {
    expect(lookOf([task({ status: "accepted" })]).ring).toBe("spinning");
    expect(lookOf([task({ status: "rework" })]).ring).toBe("spinning");
    expect(lookOf([task({ status: "sent" })]).ring).toBe("waiting");
    expect(lookOf([task({ status: "pending_review" })]).ring).toBe("closed");
    expect(lookOf([task({ status: "declined" })]).ring).toBe("broken");
  });

  it("closes in gold the moment the director accepts the last one, and flashes gold on one of several", () => {
    expect(lookOf([task({ status: "done" })])).toMatchObject({ busy: true, ring: "done", tone: "var(--gold)", accepted: true });
    expect(lookOf([task({ id: "a", status: "done" }), task({ id: "b" })])).toMatchObject({ busy: true, ring: "spinning", accepted: true });
    expect(lookOf([task({})]).accepted).toBe(false);
  });

  it("speaks the colours of «Задачи»: green at work, yellow handed in, red late or refused", () => {
    expect(toneFor(task({ status: "sent" }))).toBe("var(--accent)");
    expect(toneFor(task({ status: "accepted" }))).toBe("var(--ok)");
    expect(toneFor(task({ status: "pending_review" }))).toBe("var(--warn)");
    expect(toneFor(task({ status: "rework" }))).toBe("var(--warn)");
    expect(toneFor(task({ status: "accepted", overdue: true }))).toBe("var(--danger)");
    expect(toneFor(task({ status: "declined" }))).toBe("var(--danger)");
    // handed in late is the director's to look at now, not a red mark on him
    expect(toneFor(task({ status: "pending_review", overdue: true }))).toBe("var(--warn)");
  });

  it("puts the task that needs the director first", () => {
    const order = [task({ id: "w" }), task({ id: "s", status: "sent" }), task({ id: "r", status: "pending_review" }), task({ id: "l", overdue: true }), task({ id: "d", status: "declined" })]
      .sort((a, b) => urgencyOf(a) - urgencyOf(b))
      .map((t) => t.id);
    expect(order).toEqual(["d", "l", "r", "s", "w"]);
  });

  it("shows the task that needs the director first, and counts the arcs by the tasks in work", () => {
    const look = lookOf([task({ id: "a" }), task({ id: "b", status: "rework" }), task({ id: "c", status: "pending_review" })]);
    expect(look.ring).toBe("closed");
    expect(look.lead?.id).toBe("c");
    expect(look.arcs).toBe(2);
    expect(lookOf([task({ id: "a" }), task({ id: "b" }), task({ id: "c" }), task({ id: "d" })]).arcs).toBe(3);
  });

  it("a request for time is a question to the director (D-128)", () => {
    expect(lookOf([task({ unread: true }), task({ request: "2026-09-27T05:00:00Z" })]).badge).toBe("question");
  });

  it("puts one badge on, the most pressing: a refusal, then a question, then an unread word", () => {
    expect(lookOf([task({ unread: true }), task({ question: "Какой адрес?" })]).badge).toBe("question");
    expect(lookOf([task({ unread: true }), task({ status: "declined" })]).badge).toBe("declined");
    expect(lookOf([task({ unread: true })]).badge).toBe("message");
    expect(lookOf([task({})]).badge).toBeNull();
  });

  it("names the stage the way the director says it", () => {
    expect(wordOf(task({ status: "sent" }))).toBe("выдана, ещё не принял");
    expect(wordOf(task({ overdue: true }))).toBe("просрочена · в работе");
    expect(wordOf(task({ status: "declined", reason: "занят срочным" }))).toBe("не может: занят срочным");
  });
});
