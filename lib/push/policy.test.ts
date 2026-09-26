import { describe, expect, it } from "vitest";

import { lockScreenText, pushTag, transportFor } from "./policy";

describe("transportFor — the fixed policy (D-114)", () => {
  it("wakes the phone for work that needs an answer", () => {
    for (const kind of ["task_sent", "rework", "revoked", "message", "pending_review", "declined"]) {
      expect(transportFor({ event_kind: kind, meta: {} })).toEqual({ ttl: 86_400, urgency: "high", silent: false });
    }
  });

  it("carries good news quietly", () => {
    expect(transportFor({ event_kind: "done", meta: {} })).toMatchObject({ urgency: "normal", silent: true });
    expect(transportFor({ event_kind: "deadline_extended", meta: {} })).toMatchObject({ silent: true });
    // D-128: what the employee has to act on rings; «скоро срок» is worthless after its hour
    expect(transportFor({ event_kind: "deadline_moved", meta: {} })).toMatchObject({ silent: false, urgency: "high" });
    expect(transportFor({ event_kind: "deadline_kept", meta: {} })).toMatchObject({ silent: false, urgency: "high" });
    expect(transportFor({ event_kind: "task_nudge", meta: {} })).toMatchObject({ silent: false, urgency: "high" });
    expect(transportFor({ event_kind: "deadline_soon", meta: {} })).toMatchObject({ ttl: 3600, urgency: "high" });
    expect(transportFor({ event_kind: "shop_ready", meta: {} })).toMatchObject({ silent: true });
  });

  it("lets a push die with its moment", () => {
    expect(transportFor({ event_kind: "errand_sent", meta: {} }).ttl).toBe(1_800);
    expect(transportFor({ event_kind: "visit_arrived", meta: {} }).ttl).toBe(1_200);
    expect(transportFor({ event_kind: "visit_message", meta: {} }).ttl).toBe(1_800);
    expect(transportFor({ event_kind: "event_reminder", meta: {} }).ttl).toBe(3_600);
  });

  it("keeps the alarm loud and short-lived, whatever the director chose", () => {
    expect(transportFor({ event_kind: "errand_sent", meta: { urgent: true }, silent: true })).toEqual({
      ttl: 300,
      urgency: "high",
      silent: false,
    });
  });

  it("quiets the director's «Тихо» rows and lets them wait for doze", () => {
    expect(transportFor({ event_kind: "pending_review", meta: {}, silent: true })).toEqual({
      ttl: 86_400,
      urgency: "normal",
      silent: true,
    });
  });

  it("sends an unknown kind as before: 12 hours, high", () => {
    expect(transportFor({ event_kind: "something_new", meta: null })).toEqual({ ttl: 43_200, urgency: "high", silent: false });
  });
});

describe("lockScreenText", () => {
  const text = { title: "Марат · «Отчёт по складу»", body: "Отчёт почти готов" };

  it("keeps the words unless the director hid them", () => {
    expect(lockScreenText({ category: "messages", private: false }, text)).toBe(text);
  });

  it("says only what kind of news it is", () => {
    expect(lockScreenText({ category: "messages", private: true }, text)).toEqual({ title: "Новое сообщение", body: "" });
    expect(lockScreenText({ category: null, private: true }, text)).toEqual({ title: "Pulse", body: "" });
  });

  it("never hides the alarm", () => {
    expect(lockScreenText({ category: "alarm", private: true }, text)).toBe(text);
  });
});

describe("pushTag", () => {
  it("keeps the trigger's tag", () => {
    expect(pushTag({ tag: "ether" }, "t1")).toBe("ether");
  });

  it("gives every word about one task one bubble", () => {
    expect(pushTag({}, "t1")).toBe("task:t1");
    expect(pushTag(null, null)).toBeNull();
  });
});
