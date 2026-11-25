import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearDraft, DRAFT_KEY, readDraft, writeDraft, type Draft } from "./draft";

/** The phone's localStorage, enough for the draft. */
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

const draft = (patch: Partial<Draft> = {}): Draft => ({ date: "2026-10-28", summary: "Склад, приёмка", ...patch });

let data: Map<string, string>;
beforeEach(() => {
  data = stubStorage();
});
afterEach(() => vi.unstubAllGlobals());

describe("the daily report draft (tasks/032)", () => {
  it("keeps the form of a day and gives it back for that day only", () => {
    writeDraft(draft());
    expect(readDraft("2026-10-28")).toEqual(draft());
    expect(readDraft("2026-10-29")).toBeNull();
    expect(JSON.parse(data.get(DRAFT_KEY) ?? "null")).toEqual(draft());
  });

  it("null forgets it", () => {
    writeDraft(draft());
    writeDraft(null);
    expect(readDraft("2026-10-28")).toBeNull();
    expect(data.has(DRAFT_KEY)).toBe(false);
  });

  it("a report handed in clears its own day's draft, not another day's", () => {
    writeDraft(draft());
    clearDraft("2026-10-29");
    expect(readDraft("2026-10-28")).toEqual(draft());
    clearDraft("2026-10-28");
    expect(data.has(DRAFT_KEY)).toBe(false);
  });

  it("nothing readable is no draft", () => {
    data.set(DRAFT_KEY, "{not json");
    expect(readDraft("2026-10-28")).toBeNull();
    data.set(DRAFT_KEY, "null");
    expect(readDraft("2026-10-28")).toBeNull();
  });

  it("a draft of an older build keeps its words; its «Пришёл / Ушёл» are not read (D-198)", () => {
    data.set(DRAFT_KEY, JSON.stringify({ date: "2026-10-28", arrived: "08:40", left: "17:15", summary: "Объект" }));
    expect(readDraft("2026-10-28")).toEqual({ date: "2026-10-28", summary: "Объект" });
    data.set(DRAFT_KEY, JSON.stringify({ date: "2026-10-28", arrived: "08:40" }));
    expect(readDraft("2026-10-28")).toEqual({ date: "2026-10-28", summary: "" });
  });

  it("writes the words alone", () => {
    writeDraft({ ...draft(), arrived: "09:00" } as Draft);
    expect(JSON.parse(data.get(DRAFT_KEY) ?? "null")).toEqual(draft());
  });

  it("a store that refuses (private mode) loses nothing but the draft", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: () => {
          throw new Error("SecurityError");
        },
      },
    });
    expect(() => writeDraft(draft())).not.toThrow();
    expect(readDraft("2026-10-28")).toBeNull();
    expect(() => clearDraft("2026-10-28")).not.toThrow();
  });
});
