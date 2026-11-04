import { mergeDailyReport, type CompanySettings, type SettingsPatch } from "@/lib/settings";

/** The default pair of each provider (D-63); the card and the lab change it later. */
const PARSER_DEFAULTS = {
  anthropic: { model: "claude-haiku-4-5", escalation_model: "claude-sonnet-5" },
  deepseek: { model: "deepseek-chat", escalation_model: "deepseek-reasoner" },
} as const;

/** A new company's settings are explicit and few (tasks/029): the rest comes from the schema's defaults. */
export function startingSettings(provider: keyof typeof PARSER_DEFAULTS, pointsEnabled: boolean): Record<string, unknown> {
  return { parser: { ...PARSER_DEFAULTS[provider], escalate: true }, points_enabled: pointsEnabled };
}

/**
 * The stored form of a settings patch: `/api/settings`'s merge, section by section. The base merges
 * sections shallowly (`settings || patch`), so a partial section is completed here and a key the
 * patch does not name stays out. `parser_rules` and `dev_tools` cannot arrive: the schema is strict.
 */
export function mergeSettingsPatch(current: CompanySettings, body: SettingsPatch, today: string): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (body.stt) patch.stt = { ...current.stt, ...body.stt };
  if (body.parser) patch.parser = { ...current.parser, ...body.parser };
  if (body.delivery_window) patch.delivery_window = { ...current.delivery_window, ...body.delivery_window };
  if (body.brand) patch.brand = { ...current.brand, ...body.brand };
  if (body.vocabulary) patch.vocabulary = [...new Set(body.vocabulary.map((word) => word.trim()).filter(Boolean))];
  if (body.conventions) patch.conventions = body.conventions;
  if (body.matching) patch.matching = { ...current.matching, ...body.matching };
  if (body.secretary) patch.secretary = { ...current.secretary, ...body.secretary };
  if (body.points_enabled !== undefined) patch.points_enabled = body.points_enabled;
  if (body.rating_mode) patch.rating_mode = body.rating_mode;
  if (body.mascot_seasons !== undefined) patch.mascot_seasons = body.mascot_seasons;
  if (body.mascot_telegraph !== undefined) patch.mascot_telegraph = body.mascot_telegraph;
  if (body.lab_for_all !== undefined) patch.lab_for_all = body.lab_for_all;
  if (body.points_rules) patch.points_rules = body.points_rules;
  if (body.ether_events) patch.ether_events = body.ether_events;
  if (body.voice_retention) patch.voice_retention = body.voice_retention;
  // D-152: `started_on` / `checked_on` are the server's
  if (body.daily_report) patch.daily_report = mergeDailyReport(current.daily_report, body.daily_report, today);
  return patch;
}
