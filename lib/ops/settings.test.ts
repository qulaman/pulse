import { describe, expect, it } from "vitest";

import { CompanySettingsSchema, SettingsPatchSchema } from "@/lib/settings";

import { mergeSettingsPatch, startingSettings } from "./settings";

const current = CompanySettingsSchema.parse({ parser: { model: "deepseek-chat", escalation_model: "deepseek-reasoner" } });

describe("startingSettings", () => {
  it("holds only what was chosen", () => {
    expect(Object.keys(startingSettings("anthropic", false)).sort()).toEqual(["parser", "points_enabled"]);
  });

  it("gives each provider its own pair of models", () => {
    expect(startingSettings("deepseek", true)).toEqual({
      parser: { model: "deepseek-chat", escalation_model: "deepseek-reasoner", escalate: true },
      points_enabled: true,
    });
    expect(startingSettings("anthropic", false).parser).toMatchObject({ model: "claude-haiku-4-5" });
  });

  it("reads back through the schema", () => {
    const parsed = CompanySettingsSchema.parse(startingSettings("deepseek", true));
    expect(parsed.parser.model).toBe("deepseek-chat");
    expect(parsed.points_enabled).toBe(true);
  });
});

describe("mergeSettingsPatch", () => {
  it("completes a partial section from the current one", () => {
    const patch = mergeSettingsPatch(current, { parser: { model: "claude-haiku-4-5" } }, "2026-11-04");
    expect(patch).toEqual({ parser: { ...current.parser, model: "claude-haiku-4-5" } });
    expect(patch.parser).toMatchObject({ escalation_model: "deepseek-reasoner" });
  });

  it("leaves out what the patch does not name", () => {
    expect(mergeSettingsPatch(current, { points_enabled: false, lab_for_all: true }, "2026-11-04")).toEqual({
      points_enabled: false,
      lab_for_all: true,
    });
  });

  it("keeps a section sent whole", () => {
    const retention = { closed_days: 120, orphan_days: 14 };
    expect(mergeSettingsPatch(current, { voice_retention: retention }, "2026-11-04")).toEqual({ voice_retention: retention });
  });

  it("starts the daily report's fines from today when the module is switched on", () => {
    const off = CompanySettingsSchema.parse({ daily_report: { enabled: false } });
    const patch = mergeSettingsPatch(off, { daily_report: { enabled: true } }, "2026-11-04");
    expect(patch.daily_report).toMatchObject({ enabled: true, started_on: "2026-11-04" });
  });

  it("the schema itself refuses the keys no patch carries", () => {
    expect(SettingsPatchSchema.safeParse({ parser_rules: { versions: [] } }).success).toBe(false);
    expect(SettingsPatchSchema.safeParse({ dev_tools: true }).success).toBe(false);
  });
});
