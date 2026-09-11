import "server-only";

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
};

const FALLBACK: Brand = {
  companyId: null,
  name: "Pulse",
  tagline: null,
  logoUrl: null,
  accent: effectiveAccent(null).accent,
  customAccent: false,
};

/**
 * The brand of this instance (V-02: one company per deployment, so without an id the
 * first row is the company). Read with the service role: the login screen shows the
 * logo before anyone is signed in. Never throws — a broken row means the default brand.
 */
export async function loadBrand(companyId?: string): Promise<Brand> {
  try {
    const supabase = createServiceSupabase();
    let query = supabase.from("companies").select("id, name, settings").order("created_at").limit(1);
    if (companyId) query = query.eq("id", companyId);
    const { data } = await query.maybeSingle();
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
    };
  } catch (error) {
    console.error("brand load failed:", error instanceof Error ? error.message : error);
    return FALLBACK;
  }
}
