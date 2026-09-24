import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { collectMisheard } from "@/lib/dictionary-learn";
import { loadCompanySettings, loadRoster } from "@/lib/roster";
import { DICTIONARY_DISMISSED_MAX, parseCompanySettings } from "@/lib/settings";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";

/** How far back the director's corrections are read. */
const DAYS = 30;
const MAX_BATCHES = 500;

/**
 * «Из ваших записей» (D-111, second wave): names the AI could not place and the person the
 * director placed them on, from the confirmed batches of the last 30 days. ai_logs is the
 * director's alone under RLS, and the secretary runs the dictionary too (D-104) — so the
 * service client reads it, scoped to the caller's company, and hands out only the pairs
 * «form → person» with a count: never a transcript, never a task.
 */
export const GET = withAuth(["director", "secretary"], async ({ profile }) => {
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const service = createServiceSupabase();
  const [logs, roster, raw] = await Promise.all([
    service
      .from("ai_logs")
      .select("parsed_entities, confirmed_entities, created_at")
      .eq("company_id", profile.companyId)
      .eq("kind", "parse")
      .eq("status", "ok")
      .not("confirmed_entities", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_BATCHES),
    loadRoster(profile.companyId),
    loadCompanySettings(profile.companyId),
  ]);
  if (logs.error) throw new Error(`ai_logs read failed: ${logs.error.message}`);

  const settings = parseCompanySettings(raw);
  const items = collectMisheard(logs.data ?? [], roster, settings.matching, settings.dictionary.dismissed);
  return apiOk({ items });
});

const BodySchema = z.strictObject({ dismiss: z.array(z.string().min(3).max(120)).min(1).max(20) });

/**
 * «×» on a lesson: hidden for everybody who runs the dictionary. Merged with the stored
 * list here, the newest kept; hiding twice changes nothing.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director", "secretary"],
  async ({ req, profile, body }) => {
    const current = parseCompanySettings(await loadCompanySettings(profile.companyId));
    const dismissed = [...new Set([...current.dictionary.dismissed, ...body.dismiss])].slice(-DICTIONARY_DISMISSED_MAX);

    const supabase = await userSupabase(req);
    const { error } = await supabase.rpc("update_company_settings", {
      patch: { dictionary: { ...current.dictionary, dismissed } } as Json,
    });
    if (error) {
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      throw new Error(`update_company_settings failed: ${error.message}`);
    }
    return apiOk({ dismissed });
  },
  BodySchema,
);
