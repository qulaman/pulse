import { describe, expect, it } from "vitest";

import { categoryValue, DEFAULT_NOTIFY_PREFS, NotifyPrefsSchema, parseNotifyPrefs, quietValue } from "./prefs";

describe("director push rules (D-114)", () => {
  it("defaults to today's behaviour plus the two new signals", () => {
    expect(DEFAULT_NOTIFY_PREFS.modes).toEqual({
      review: "now",
      declined: "now",
      questions: "now",
      messages: "now",
      unseen: "now",
      overdue: "digest",
      secretary: "now",
      calendar: "now",
      shop: "now",
    });
    expect(DEFAULT_NOTIFY_PREFS.quiet.on).toBe(false);
    expect(DEFAULT_NOTIFY_PREFS.meetings).toBe(false);
    expect(DEFAULT_NOTIFY_PREFS.unseen_after_min).toBe(30);
    expect(DEFAULT_NOTIFY_PREFS.day_summary_at).toBeNull();
  });

  it("fills a partial object with defaults, key by key", () => {
    const prefs = parseNotifyPrefs({ modes: { messages: "digest" }, quiet: { on: true } });
    expect(prefs.modes.messages).toBe("digest");
    expect(prefs.modes.review).toBe("now");
    expect(prefs.quiet).toEqual({ on: true, from: "21:00", to: "08:00", weekends: false });
  });

  it("keeps the readable sections of a broken row", () => {
    const prefs = parseNotifyPrefs({ modes: "garbage", meetings: true, quiet: { from: "99:99" } });
    expect(prefs.meetings).toBe(true);
    expect(prefs.modes).toEqual(DEFAULT_NOTIFY_PREFS.modes);
    expect(prefs.quiet.from).toBe("21:00");
  });

  it("refuses a time that is not a time", () => {
    expect(NotifyPrefsSchema.safeParse({ day_summary_at: "7pm" }).success).toBe(false);
    expect(NotifyPrefsSchema.safeParse({ day_summary_at: "19:00" }).success).toBe(true);
  });

  it("words the rows", () => {
    expect(categoryValue(DEFAULT_NOTIFY_PREFS, "overdue")).toBe("Сводкой");
    expect(categoryValue(DEFAULT_NOTIFY_PREFS, "unseen")).toBe("30 мин");
    expect(categoryValue(parseNotifyPrefs({ modes: { unseen: "digest" } }), "unseen")).toBe("30 мин · сводкой");
    expect(quietValue(DEFAULT_NOTIFY_PREFS)).toBe("выключено");
    expect(quietValue(parseNotifyPrefs({ quiet: { on: true, weekends: true } }))).toBe("21:00–08:00, сб–вс");
  });
});
