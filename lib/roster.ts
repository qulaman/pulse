import "server-only";

import { countByAssignee, pickHintRoster } from "@/lib/ai/hint-roster";
import { buildVocabularyHints } from "@/lib/ai/stt";
import type { RosterUser } from "@/lib/matchName";
import { createServiceSupabase } from "@/lib/supabase/service";

export type RosterProfile = RosterUser & { position: string | null };

/**
 * Roster of the company: the matcher's candidate list and the STT prompt in one read.
 * Service client — a director's own RLS would do, but the pipeline also runs for
 * employee voice messages, whose RLS shows them nobody else.
 * Stable order by id keeps prompt caching honest (docs/AI.md §9).
 * The TV kiosk is a login, not a person: it can neither be assigned a task nor be
 * heard in speech, and «TV Kiosk» in the STT prompt is one more line to echo (D-53).
 */
export async function loadRoster(companyId: string): Promise<RosterProfile[]> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, aliases, is_active, position")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .neq("role", "tv")
    .order("id");

  if (error) throw new Error(`roster read failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    aliases: row.aliases ?? [],
    is_active: row.is_active,
    position: row.position,
  }));
}

export type CompanySettings = Record<string, unknown> | null;

/** Everything client-specific lives here, never in code (V-02, docs/BACKEND.md §0.5). */
export async function loadCompanySettings(companyId: string): Promise<CompanySettings> {
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from("companies")
    .select("settings")
    .eq("id", companyId)
    .maybeSingle();

  if (error) throw new Error(`company settings read failed: ${error.message}`);
  const settings = data?.settings;
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as CompanySettings)
    : null;
}

/**
 * Tasks per assignee over the last `days` — the order of preference for the STT prompt
 * when the roster is larger than the prompt can safely carry (D-55).
 */
export async function loadAssigneeCounts(companyId: string, days = 90): Promise<Map<string, number>> {
  const supabase = createServiceSupabase();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("tasks")
    .select("assignee_id")
    .eq("company_id", companyId)
    .gte("created_at", since)
    .limit(5000);
  if (error) throw new Error(`assignee counts read failed: ${error.message}`);
  return countByAssignee(data ?? []);
}

/**
 * company.settings.vocabulary — counterparties and site names (docs/AI.md §1).
 * A roster over HINT_MAX_PEOPLE is trimmed to the most-addressed people (`counts`).
 */
export function vocabularyHintsFor(
  roster: RosterProfile[],
  settings?: { vocabulary?: string[] } | null,
  counts: ReadonlyMap<string, number> = new Map(),
): string[] {
  return buildVocabularyHints({
    users: pickHintRoster(roster, counts).map((u) => ({ full_name: u.full_name, aliases: u.aliases })),
    counterparties: settings?.vocabulary ?? [],
  });
}
