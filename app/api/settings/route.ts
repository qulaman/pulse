import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { loadCompanySettings } from "@/lib/roster";
import { parseCompanySettings, SettingsPatchSchema, type SettingsPatch } from "@/lib/settings";
import type { Json } from "@/lib/supabase/types";

/** Director reads the effective settings (defaults applied). */
export const GET = withAuth(["director"], async ({ profile }) => {
  const raw = await loadCompanySettings(profile.companyId);
  return apiOk({ settings: parseCompanySettings(raw) });
});

/**
 * Director changes a subset of sections. Sections are merged shallowly by the RPC
 * (jsonb ||), so a section arrives whole: the client sends the full section it edited.
 */
export const PATCH = withAuth<SettingsPatch>(
  ["director"],
  async ({ req, profile, body }) => {
    const current = parseCompanySettings(await loadCompanySettings(profile.companyId));
    // Fill partial sections from the current values so the stored section stays complete.
    const patch: Record<string, unknown> = {};
    if (body.stt) patch.stt = { ...current.stt, ...body.stt };
    if (body.parser) patch.parser = { ...current.parser, ...body.parser };
    if (body.delivery_window) patch.delivery_window = { ...current.delivery_window, ...body.delivery_window };
    if (body.vocabulary) patch.vocabulary = [...new Set(body.vocabulary.map((v) => v.trim()).filter(Boolean))];
    if (body.points_enabled !== undefined) patch.points_enabled = body.points_enabled;
    if (body.rating_mode) patch.rating_mode = body.rating_mode;

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("update_company_settings", { patch: patch as Json });
    if (error) {
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      throw new Error(`update_company_settings failed: ${error.message}`);
    }
    return apiOk({ settings: parseCompanySettings(data) });
  },
  SettingsPatchSchema,
);
