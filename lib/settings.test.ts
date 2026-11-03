import { describe, expect, it } from "vitest";

import {
  activeParserRules,
  mergeDailyReport,
  parseCompanySettings,
  secretaryActionCode,
  SecretarySettingsSchema,
  SettingsPatchSchema,
  withSecretaryCodes,
} from "@/lib/settings";

describe("«Правила компании» (D-138)", () => {
  const version = {
    version: 2,
    text: "«Склад» — это Тимур.",
    saved_at: "2026-10-20T10:00:00.000Z",
    saved_by: "u1",
    saved_by_name: "Директор",
    eval: { cases: 66, failed: 1, assignee: 1, f1: 0.97, deadline: 0.92, model: "claude-haiku-4-5", cost_usd: 0.2 },
  };

  it("a fresh company has none — the parser runs the core", () => {
    const settings = parseCompanySettings({});
    expect(settings.parser_rules).toEqual({ versions: [], request_id: null });
    expect(activeParserRules(settings.parser_rules)).toEqual({ text: "", version: 0 });
  });

  it("the newest version is the one in force", () => {
    const settings = parseCompanySettings({ parser_rules: { versions: [version, { ...version, version: 1, text: "старое" }] } });
    expect(activeParserRules(settings.parser_rules)).toEqual({ text: "«Склад» — это Тимур.", version: 2 });
  });

  it("a broken section is no rules, never the whole settings back to defaults", () => {
    const settings = parseCompanySettings({ parser_rules: { versions: "oops" }, points_enabled: true });
    expect(settings.parser_rules.versions).toEqual([]);
    expect(settings.points_enabled).toBe(true);
  });

  it("no settings PATCH can write the rules — only the corpus-checked save can", () => {
    expect(SettingsPatchSchema.safeParse({ parser_rules: { versions: [version] } }).success).toBe(false);
  });
});

describe("the parser's kinds and time words (task 026)", () => {
  it("a fresh company has every kind and every convention key", () => {
    const settings = parseCompanySettings({});
    expect(settings.parser.kinds).toEqual(["announcement", "task", "points", "reminder", "note", "event", "recurrence", "query"]);
    expect(settings.conventions.map((row) => row.key)).toContain("before_lunch");
  });

  it("keeps the fixed order, always keeps `task`, drops a name it does not know", () => {
    const settings = parseCompanySettings({ parser: { kinds: ["query", "note", "telepathy"] } });
    expect(settings.parser.kinds).toEqual(["task", "note", "query"]);
  });

  it("a broken kinds value is every kind, never the whole settings back to defaults", () => {
    const settings = parseCompanySettings({ parser: { kinds: "all" }, points_enabled: true });
    expect(settings.parser.kinds).toHaveLength(8);
    expect(settings.points_enabled).toBe(true);
  });

  it("old phrase/meaning conventions are read in the new form, the rest of the settings intact", () => {
    const settings = parseCompanySettings({ conventions: [{ phrase: "до обеда", meaning: "12:00 названного дня", confidence: 0.7 }], points_enabled: true });
    expect(settings.conventions.find((row) => row.key === "before_lunch")?.time).toBe("12:00");
    expect(settings.points_enabled).toBe(true);
  });
});

describe("points rules, Эфир and the telegraph (D-133)", () => {
  it("a fresh company gets the D-13 rules with the penalty off, both Эфир lines and a worrying face", () => {
    const settings = parseCompanySettings({});
    expect(settings.points_rules).toMatchObject({ quick_accept: 1, quick_accept_min: 10, on_time: 3, early: 5, late_on: false, late: 5 });
    expect(settings.points_rules.reactions).toMatchObject({ like: 1, fire: 10, heart: 100, clap: 0 });
    expect(settings.ether_events).toEqual({ merch: true, praise: true });
    expect(settings.mascot_telegraph).toBe(true);
  });

  it("keeps what a company stored and fills the rest", () => {
    const settings = parseCompanySettings({ points_rules: { on_time: 7, reactions: { heart: 50 } }, mascot_telegraph: false });
    expect(settings.points_rules.on_time).toBe(7);
    expect(settings.points_rules.early).toBe(5);
    expect(settings.points_rules.reactions).toMatchObject({ heart: 50, fire: 10 });
    expect(settings.mascot_telegraph).toBe(false);
  });

  it("the patch takes the points section whole and refuses a negative price", () => {
    expect(SettingsPatchSchema.safeParse({ points_rules: { reactions: { fire: 20 } } }).success).toBe(true);
    expect(SettingsPatchSchema.safeParse({ points_rules: { reactions: { fire: -1 } } }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ ether_events: { merch: false, praise: true }, mascot_telegraph: false }).success).toBe(true);
  });
});

describe("the daily report (D-152)", () => {
  const today = "2026-10-28";

  it("a fresh company has it on, Monday to Friday, reminded at 18:00, +1 / −10, fines not started", () => {
    const settings = parseCompanySettings({});
    expect(settings.daily_report).toEqual({
      enabled: true,
      workdays: [1, 2, 3, 4, 5],
      holidays: [],
      work_start: "09:00",
      remind_at: "18:00",
      started_on: null,
      checked_on: null,
    });
    expect(settings.points_rules).toMatchObject({ daily_report: 1, daily_report_missed: 10 });
  });

  it("keeps what a company stored and fills the rest", () => {
    const settings = parseCompanySettings({ daily_report: { workdays: [6, 1, 2, 2], started_on: "2026-10-27" } });
    expect(settings.daily_report).toMatchObject({ enabled: true, workdays: [1, 2, 6], started_on: "2026-10-27" });
  });

  it("a broken section is the defaults, never the whole settings back to defaults", () => {
    const settings = parseCompanySettings({ daily_report: { workdays: "weekdays" }, points_enabled: true });
    expect(settings.daily_report.workdays).toEqual([1, 2, 3, 4, 5]);
    expect(settings.points_enabled).toBe(true);
  });

  it("the patch takes the module's keys, refuses a bad day or clock, drops `started_on`", () => {
    expect(SettingsPatchSchema.safeParse({ daily_report: { enabled: false } }).success).toBe(true);
    expect(SettingsPatchSchema.safeParse({ daily_report: { workdays: [0] } }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ daily_report: { workdays: [] } }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ daily_report: { remind_at: "24:00" } }).success).toBe(false);
    const parsed = SettingsPatchSchema.parse({ daily_report: { remind_at: "17:30", started_on: "2020-01-01", checked_on: "2020-01-01" } });
    expect(parsed.daily_report).toEqual({ remind_at: "17:30" });
    // a missing key stays as stored: no defaults in the patch
    expect(SettingsPatchSchema.parse({ daily_report: { enabled: true } }).daily_report).toEqual({ enabled: true });
    expect(SettingsPatchSchema.safeParse({ points_rules: { daily_report_missed: -10 } }).success).toBe(false);
  });

  it("switching it on starts the fines today; any other edit keeps the start; the tick's mark is never lost", () => {
    const off = { ...parseCompanySettings({}).daily_report, enabled: false, started_on: "2026-09-01", checked_on: "2026-10-27" };
    expect(mergeDailyReport(off, { enabled: true }, today)).toMatchObject({ enabled: true, started_on: today, checked_on: "2026-10-27" });
    const on = { ...off, enabled: true };
    expect(mergeDailyReport(on, { enabled: true, remind_at: "17:00" }, today)).toMatchObject({ remind_at: "17:00", started_on: "2026-09-01" });
    expect(mergeDailyReport(on, { enabled: false }, today)).toMatchObject({ enabled: false, started_on: "2026-09-01" });
    expect(mergeDailyReport(off, { workdays: [1, 2, 3] }, today)).toMatchObject({ enabled: false, started_on: "2026-09-01" });
  });

  it("holidays (D-155 §7): real days, each once, in order; a broken list is none, the section survives", () => {
    const stored = parseCompanySettings({ daily_report: { holidays: ["2027-03-22", "2027-01-01", "2027-03-22"], started_on: "2026-10-29" } });
    expect(stored.daily_report).toMatchObject({ holidays: ["2027-01-01", "2027-03-22"], started_on: "2026-10-29" });
    const broken = parseCompanySettings({ daily_report: { holidays: ["2027-02-30"], started_on: "2026-10-29" } });
    expect(broken.daily_report).toMatchObject({ holidays: [], started_on: "2026-10-29" });
    expect(SettingsPatchSchema.parse({ daily_report: { holidays: ["2027-05-09", "2027-05-01"] } }).daily_report).toEqual({ holidays: ["2027-05-01", "2027-05-09"] });
    expect(SettingsPatchSchema.safeParse({ daily_report: { holidays: ["9 мая"] } }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ daily_report: { holidays: ["2027-02-30"] } }).success).toBe(false);
  });
});

describe("voice retention (D-155 §3)", () => {
  it("keeps a recording 90 days after its item closed, 30 when nothing came of it", () => {
    expect(parseCompanySettings({}).voice_retention).toEqual({ closed_days: 90, orphan_days: 30 });
    expect(parseCompanySettings({ voice_retention: { closed_days: 180 } }).voice_retention).toEqual({ closed_days: 180, orphan_days: 30 });
  });

  it("a broken section is the defaults; the patch refuses less than a week", () => {
    const settings = parseCompanySettings({ voice_retention: { closed_days: "forever" }, points_enabled: true });
    expect(settings.voice_retention).toEqual({ closed_days: 90, orphan_days: 30 });
    expect(settings.points_enabled).toBe(true);
    expect(SettingsPatchSchema.safeParse({ voice_retention: { closed_days: 365, orphan_days: 30 } }).success).toBe(true);
    expect(SettingsPatchSchema.safeParse({ voice_retention: { closed_days: 1, orphan_days: 30 } }).success).toBe(false);
  });
});

describe("the lab for the whole team (D-150)", () => {
  it("is closed for a fresh company and keeps what the company stored", () => {
    expect(parseCompanySettings({}).lab_for_all).toBe(false);
    expect(parseCompanySettings({ lab_for_all: true }).lab_for_all).toBe(true);
  });

  it("the patch takes the switch alone and refuses anything but a boolean", () => {
    expect(SettingsPatchSchema.safeParse({ lab_for_all: true }).success).toBe(true);
    expect(SettingsPatchSchema.safeParse({ lab_for_all: "yes" }).success).toBe(false);
  });
});

describe("secretary settings (D-79)", () => {
  it("gives a fresh company the seven default buttons (D-87: «не беспокоить», the guest; D-99: «охрана»)", () => {
    const settings = parseCompanySettings({});
    expect(settings.secretary.actions.map((a) => a.code)).toEqual(["coffee", "tea", "dnd", "guest", "security", "doctor", "come"]);
    expect(settings.secretary.escalate_after_min).toBe(3);
  });

  it("keeps the catalogue a company has already edited", () => {
    const settings = parseCompanySettings({
      secretary: { actions: [{ code: "water", label: "Вода" }], escalate_after_min: 7 },
    });
    expect(settings.secretary.actions).toEqual([{ code: "water", label: "Вода", icon: "", synonyms: [] }]);
    expect(settings.secretary.escalate_after_min).toBe(7);
  });

  it("refuses two buttons with one code — the history of an errand must stay readable", () => {
    const result = SecretarySettingsSchema.safeParse({
      actions: [
        { code: "coffee", label: "Кофе" },
        { code: "coffee", label: "Кофе с молоком" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("takes the section in a patch", () => {
    const result = SettingsPatchSchema.safeParse({
      secretary: { actions: [{ code: "water", label: "Вода", icon: "💧", synonyms: ["воды"] }] },
    });
    expect(result.success).toBe(true);
  });

  it("falls back to the defaults when the stored section is broken", () => {
    const settings = parseCompanySettings({ secretary: { escalate_after_min: 999 } });
    expect(settings.secretary.escalate_after_min).toBe(3);
  });
});

describe("secretaryActionCode", () => {
  it("transliterates the label the director typed", () => {
    expect(secretaryActionCode("Вода")).toBe("voda");
    expect(secretaryActionCode("Зайди ко мне")).toBe("zaydi_ko_mne");
  });

  it("does not collide with a code already in the catalogue", () => {
    expect(secretaryActionCode("Вода", ["voda"])).toBe("voda_2");
  });

  it("falls back to action_N when there is nothing to transliterate", () => {
    expect(secretaryActionCode("☕", ["coffee"])).toBe("action_2");
  });
});

describe("withSecretaryCodes", () => {
  it("drops empty rows and gives a new one its code", () => {
    expect(
      withSecretaryCodes([
        { code: "coffee", label: "Кофе", icon: "☕", synonyms: [] },
        { code: "", label: "  ", icon: "", synonyms: [] },
        { code: "", label: " Вода ", icon: "💧", synonyms: [] },
      ]),
    ).toEqual([
      { code: "coffee", label: "Кофе", icon: "☕", synonyms: [] },
      { code: "voda", label: "Вода", icon: "💧", synonyms: [] },
    ]);
  });

  it("never rewrites the code of a button that already exists", () => {
    const [row] = withSecretaryCodes([{ code: "coffee", label: "Кофе с молоком", icon: "", synonyms: [] }]);
    expect(row.code).toBe("coffee");
  });
});

describe("the guards' phone (D-99)", () => {
  it("takes a phone number and keeps the rest of the settings", () => {
    const settings = parseCompanySettings({ secretary: { security_phone: "+7 (700) 123-45-67" }, points_enabled: true });
    expect(settings.secretary.security_phone).toBe("+7 (700) 123-45-67");
    expect(settings.points_enabled).toBe(true);
  });

  it("refuses letters in it", () => {
    expect(SecretarySettingsSchema.safeParse({ security_phone: "позвонить Ивану" }).success).toBe(false);
  });
});
