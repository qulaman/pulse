import "server-only";

import { cache } from "react";

import { effectiveAccent } from "@/lib/brand-color";
import { parseCompanySettings } from "@/lib/settings";
import { createServiceSupabase } from "@/lib/supabase/service";

export type Brand = {
  companyId: string | null;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  /** The accent to paint with — already contrast-checked. */
  accent: string;
  customAccent: boolean;
  /** `settings.points_enabled` (D-48): the shell draws the points line from the same read. */
  pointsEnabled: boolean;
};

const FALLBACK: Brand = {
  companyId: null,
  name: "Pulse",
  tagline: null,
  logoUrl: null,
  accent: effectiveAccent(null).accent,
  customAccent: false,
  pointsEnabled: false,
};

type CompanyRow = { id: string; name: string; settings: unknown };

/**
 * The company row of this instance, read once per server render: the root layout, the
 * header and the employee shell all paint from it (D-126). React's cache lives for one
 * request, so a changed brand shows on the next render.
 */
const loadCompanyRow = cache(async (companyId?: string): Promise<CompanyRow | null> => {
  const supabase = createServiceSupabase();
  let query = supabase.from("companies").select("id, name, settings").order("created_at").limit(1);
  if (companyId) query = query.eq("id", companyId);
  const { data } = await query.maybeSingle();
  return data;
});

/**
 * The brand of this instance (V-02: one company per deployment, so without an id the
 * first row is the company). Read with the service role: the login screen shows the
 * logo before anyone is signed in. Never throws — a broken row means the default brand.
 */
export async function loadBrand(companyId?: string): Promise<Brand> {
  try {
    // one company per deployment: the first row is the one asked for, so the root layout's
    // read serves the header too; an id that is not it still gets its own read
    const first = await loadCompanyRow();
    const data = !companyId || first?.id === companyId ? first : await loadCompanyRow(companyId);
    if (!data) return FALLBACK;
    const settings = parseCompanySettings(data.settings);
    const { accent, custom } = effectiveAccent(settings.brand.accent);
    return {
      companyId: data.id,
      name: data.name,
      tagline: settings.brand.tagline,
      logoUrl: settings.brand.logo_url,
      accent,
      customAccent: custom,
      pointsEnabled: settings.points_enabled,
    };
  } catch (error) {
    console.error("brand load failed:", error instanceof Error ? error.message : error);
    return FALLBACK;
  }
}
