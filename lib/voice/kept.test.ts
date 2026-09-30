import { describe, expect, it } from "vitest";

import { isReady, keptView, type KeptPhrase } from "./kept";

function phrase(id: string, overrides: Partial<KeptPhrase> = {}): KeptPhrase {
  return {
    id,
    userId: "u-dir",
    createdAt: "2026-09-30T09:05:00.000Z",
    updatedAt: 0,
    crid: id,
    source: "voice",
    audio: null,
    audioPath: null,
    inboxId: null,
    transcript: "",
    address: null,
    pinned: null,
    toSecretary: false,
    suspicious: false,
    stage: "recorded",
    entities: [],
    parsedEntities: [],
    errand: null,
    confirm: null,
    failure: null,
    attempts: 0,
    ...overrides,
  };
}

describe("isReady", () => {
  it("parsed cards and a refused step wait for the director; the rest goes by itself", () => {
    expect(isReady(phrase("a", { stage: "parsed" }))).toBe(true);
    expect(isReady(phrase("b", { failure: { code: "stt_failed" } }))).toBe(true);
    expect(isReady(phrase("c", { stage: "recorded" }))).toBe(false);
    expect(isReady(phrase("d", { stage: "heard" }))).toBe(false);
    expect(isReady(phrase("e", { stage: "sending" }))).toBe(false);
  });
});

describe("keptView", () => {
  it("says nothing when the phone holds nothing but the phrase on the face", () => {
    expect(keptView([], null)).toBeNull();
    expect(keptView([phrase("live", { stage: "parsed" })], "live")).toBeNull();
  });

  it("a phrase that waits for the director outranks the ones on their way", () => {
    const view = keptView([phrase("a"), phrase("b", { stage: "parsed" }), phrase("c", { stage: "parsed" })], null);
    expect(view).toMatchObject({ kind: "ready", more: 1 });
    expect(view?.kind === "ready" && view.phrase.id).toBe("b");
  });

  it("counts the phrases on their way", () => {
    expect(keptView([phrase("a"), phrase("b", { stage: "sending" }), phrase("live")], "live")).toEqual({ kind: "waiting", count: 2 });
  });
});
