import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk, NO_ACCESS, rpcFailure } from "@/lib/api/respond";
import { loadBrand } from "@/lib/brand";
import { loadCompanySettings } from "@/lib/roster";
import { BrandPatchSchema, parseCompanySettings } from "@/lib/settings";
import type { Json } from "@/lib/supabase/types";

const PatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    brand: BrandPatchSchema,
  })
  .partial()
  .strict();

/** Director or secretary (D-104) reads the company card: name and brand section. */
export const GET = withAuth(["director", "secretary"], async ({ profile }) => {
  const brand = await loadBrand(profile.companyId);
  const settings = parseCompanySettings(await loadCompanySettings(profile.companyId));
  return apiOk({ name: brand.name, brand: settings.brand, effective_accent: brand.accent });
});

/**
 * Director or secretary (D-104) edits the company: the name through its own RPC, the brand section through
 * the settings merge (sent whole so the stored section stays complete).
 */
export const PATCH = withAuth<z.infer<typeof PatchSchema>>(
  ["director", "secretary"],
  async ({ req, profile, body }) => {
    const supabase = await userSupabase(req);

    if (body.name !== undefined) {
      const { error } = await supabase.rpc("update_company_profile", { p_name: body.name });
      if (error) {
        const refusals = { forbidden: NO_ACCESS, invalid_name: [400, "Название от 1 до 120 символов", "validation_error"] } as const;
        return rpcFailure(error, refusals, "update_company_profile");
      }
    }

    if (body.brand) {
      const current = parseCompanySettings(await loadCompanySettings(profile.companyId));
      const merged = { ...current.brand, ...body.brand };
      const { error } = await supabase.rpc("update_company_settings", { patch: { brand: merged } as Json });
      if (error) {
        return rpcFailure(error, { forbidden: NO_ACCESS }, "update_company_settings");
      }
    }

    const brand = await loadBrand(profile.companyId);
    const settings = parseCompanySettings(await loadCompanySettings(profile.companyId));
    return apiOk({ name: brand.name, brand: settings.brand, effective_accent: brand.accent });
  },
  PatchSchema,
);
