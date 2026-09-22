import { describe, expect, it } from "vitest";

import {
  parseCompanySettings,
  secretaryActionCode,
  SecretarySettingsSchema,
  SettingsPatchSchema,
  withSecretaryCodes,
} from "@/lib/settings";

describe("secretary settings (D-79)", () => {
  it("gives a fresh company the four default buttons", () => {
    const settings = parseCompanySettings({});
    expect(settings.secretary.actions.map((a) => a.code)).toEqual(["coffee", "tea", "doctor", "come"]);
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
