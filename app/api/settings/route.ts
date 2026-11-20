import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk, NO_ACCESS, rpcFailure } from "@/lib/api/respond";
import { todayYmd } from "@/lib/datetime/calendar";
import { loadCompanySettings } from "@/lib/roster";
import { mergeSettingsPatch } from "@/lib/ops/settings";
import { parseCompanySettings, SettingsPatchSchema, type SettingsPatch } from "@/lib/settings";
import type { Json } from "@/lib/supabase/types";

/** Director or secretary (D-104) reads the effective settings (defaults applied). */
export const GET = withAuth(["director", "secretary"], async ({ profile }) => {
  const raw = await loadCompanySettings(profile.companyId);
  return apiOk({ settings: parseCompanySettings(raw) });
});

/**
 * Director or secretary (D-104) changes a subset of sections. Sections are merged shallowly by the RPC
 * (jsonb ||), so a section arrives whole: the client sends the full section it edited.
 */
export const PATCH = withAuth<SettingsPatch>(
  ["director", "secretary"],
  async ({ req, profile, body }) => {
    // partial sections are completed from the current values, so a stored section stays whole
    const current = parseCompanySettings(await loadCompanySettings(profile.companyId));
    const patch = mergeSettingsPatch(current, body, todayYmd());

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("update_company_settings", { patch: patch as Json });
    if (error) {
      return rpcFailure(error, { forbidden: NO_ACCESS }, "update_company_settings");
    }
    return apiOk({ settings: parseCompanySettings(data) });
  },
  SettingsPatchSchema,
);
