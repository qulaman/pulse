import { describe, expect, it } from "vitest";

import {
  parseCompanySettings,
  secretaryActionCode,
  SecretarySettingsSchema,
  SettingsPatchSchema,
  withSecretaryCodes,
} from "@/lib/settings";

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
