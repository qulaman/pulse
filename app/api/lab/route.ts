import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";
import { MODEL_PRICES, STT_PRICE_PER_MINUTE } from "@/lib/ai/pricing";
import { buildLabRows, type LabResponse, type LogRow } from "@/lib/lab/rows";
import { loadCompanySettings } from "@/lib/roster";
import { parseCompanySettings, ParserSettingsSchema, SttSettingsSchema } from "@/lib/settings";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";

/**
 * The developer's lab (D-63): the model switches and the cost of every director
 * recognition, priced from ai_logs. Any signed-in profile of the company may read
 * and switch — the owner asked for no role check while the comparison runs.
 */

const LOG_LIMIT = 400;

export const GET = withAuth("any", async ({ profile }) => {
  const supabase = createServiceSupabase();
  const [settings, logs] = await Promise.all([
    loadCompanySettings(profile.companyId).then(parseCompanySettings),
    supabase
      .from("ai_logs")
      .select(
        "id, kind, source, provider, model, transcript, raw_response, input_tokens, output_tokens, cache_read_tokens, stt_ms, parse_ms, status, client_request_id, created_at",
      )
      .eq("company_id", profile.companyId)
      .in("kind", ["stt", "parse"])
      .order("created_at", { ascending: false })
      .limit(LOG_LIMIT),
  ]);
  if (logs.error) throw new Error(`ai_logs read failed: ${logs.error.message}`);

  const body: LabResponse = {
    settings: { stt: settings.stt, parser: settings.parser },
    rows: buildLabRows(logs.data as LogRow[]),
    prices: { models: MODEL_PRICES, stt_per_minute: STT_PRICE_PER_MINUTE },
  };
  return apiOk(body);
});

const PatchSchema = z
  .object({
    stt: SttSettingsSchema.partial(),
    parser: ParserSettingsSchema.partial(),
  })
  .partial()
  .strict();

function asRecord(value: unknown): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, Json | undefined>) : {};
}

/** Same shallow section merge as update_company_settings, minus its director check (owner's call, D-63). */
export const PATCH = withAuth<z.infer<typeof PatchSchema>>(
  "any",
  async ({ profile, body }) => {
    const supabase = createServiceSupabase();
    const raw = await loadCompanySettings(profile.companyId);
    const current = parseCompanySettings(raw);
    // Unknown keys stay: other subsystems own theirs.
    const next: Record<string, Json | undefined> = { ...asRecord(raw) };
    if (body.stt) next.stt = { ...current.stt, ...body.stt };
    if (body.parser) next.parser = { ...current.parser, ...body.parser };

    const { data, error } = await supabase
      .from("companies")
      .update({ settings: next as Json })
      .eq("id", profile.companyId)
      .select("settings")
      .single();
    if (error) throw new Error(`lab settings write failed: ${error.message}`);
    const saved = parseCompanySettings(data.settings);
    return apiOk({ settings: { stt: saved.stt, parser: saved.parser } });
  },
  PatchSchema,
);
