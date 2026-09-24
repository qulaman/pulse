import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { suggestWords, usageOf } from "@/lib/dictionary-usage";
import { loadCompanySettings, loadRoster } from "@/lib/roster";
import { DICTIONARY_DISMISSED_MAX, parseCompanySettings } from "@/lib/settings";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";

/** How far back the speech is read. */
const DAYS = 30;
const MAX_PHRASES = 1000;

/**
 * How the vocabulary lives in the company's speech (D-111, words wave): per word — in how
 * many parsed phrases of the last 30 days it came up and when last; and the names that
 * keep coming up but the vocabulary lacks. ai_logs is the director's alone under RLS and
 * the secretary runs the dictionary too (D-104) — so the service client reads it, scoped
 * to the caller's company, and hands out numbers and single words: never a phrase.
 */
export const GET = withAuth(["director", "secretary"], async ({ profile }) => {
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const service = createServiceSupabase();
  const [logs, roster, raw] = await Promise.all([
    service
      .from("ai_logs")
      .select("transcript, created_at")
      .eq("company_id", profile.companyId)
      .eq("kind", "parse")
      .eq("status", "ok")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_PHRASES),
    loadRoster(profile.companyId),
    loadCompanySettings(profile.companyId),
  ]);
  if (logs.error) throw new Error(`ai_logs read failed: ${logs.error.message}`);

  const settings = parseCompanySettings(raw);
  const rows = logs.data ?? [];
  return apiOk({
    days: DAYS,
    phrases: rows.length,
    usage: usageOf(settings.vocabulary, rows),
    suggestions: suggestWords(rows, {
      names: roster.flatMap((p) => [p.full_name, ...p.aliases]),
      vocabulary: settings.vocabulary,
      dismissed: settings.dictionary.dismissed_words,
    }),
  });
});

const BodySchema = z.strictObject({ dismiss: z.array(z.string().min(1).max(120)).min(1).max(20) });

/** «×» on a suggested word: hidden for everybody who runs the dictionary; twice changes nothing. */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director", "secretary"],
  async ({ req, profile, body }) => {
    const current = parseCompanySettings(await loadCompanySettings(profile.companyId));
    const dismissed_words = [...new Set([...current.dictionary.dismissed_words, ...body.dismiss])].slice(-DICTIONARY_DISMISSED_MAX);

    const supabase = await userSupabase(req);
    const { error } = await supabase.rpc("update_company_settings", {
      patch: { dictionary: { ...current.dictionary, dismissed_words } } as Json,
    });
    if (error) {
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      throw new Error(`update_company_settings failed: ${error.message}`);
    }
    return apiOk({ dismissed_words });
  },
  BodySchema,
);
