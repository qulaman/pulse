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
  /** `settings.lab_for_all` (D-150): the team's bar carries «Лаб» — read here for the first paint. */
  labForAll: boolean;
  /** `settings.dev_tools`: «Лаборатория» and «Данные», closed to a client. */
  devTools: boolean;
  /** `settings.daily_report.enabled` (D-152): the team's bar carries «Отчёты» (D-219) — for the first paint. */
  reportsEnabled: boolean;
};

/**
 * The product's own brand: what a screen nobody has signed in to shows — `/login`, the landing,
 * a page not found — and what a broken company row falls back to. A company's own screen before
 * sign-in is `/c/<slug>` (D-135); the base holds many companies, and none of them is «the» one
 * (D-134).
 */
export const PRODUCT_BRAND: Brand = {
  companyId: null,
  name: "Pulse",
  tagline: null,
  logoUrl: null,
  accent: effectiveAccent(null).accent,
  customAccent: false,
  pointsEnabled: false,
  labForAll: false,
  devTools: false,
  reportsEnabled: false,
};

type CompanyRow = { id: string; name: string; settings: unknown };

/**
 * A company's row, read once per server render: the root layout, the header and the shells all
 * paint from it (D-126). React's cache lives for one request, so a changed brand shows on the
 * next render.
 */
const loadCompanyRow = cache(async (companyId: string): Promise<CompanyRow | null> => {
  const { data } = await createServiceSupabase()
    .from("companies")
    .select("id, name, settings")
    .eq("id", companyId)
    .maybeSingle();
  return data;
});

/**
 * The brand of the viewer's company — the caller passes the company of the signed-in profile,
 * never a company of its choosing. Read with the service role: the kiosk role does not read
 * `companies`. Never throws — a broken row means the product's brand.
 */
export async function loadBrand(companyId: string): Promise<Brand> {
  try {
    const data = await loadCompanyRow(companyId);
    return data ? brandOf(data) : PRODUCT_BRAND;
  } catch (error) {
    console.error("brand load failed:", error instanceof Error ? error.message : error);
    return PRODUCT_BRAND;
  }
}

/**
 * The brand behind a company's address `/c/<slug>` (D-135): the sign-in screen a QR opens.
 * An unknown slug gets the product's brand with no «не найдено» — the page must not tell a
 * passer-by which addresses exist (D-134: the list of clients is nobody's business).
 */
export async function loadBrandBySlug(slug: string): Promise<Brand> {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return PRODUCT_BRAND;
  try {
    const { data } = await createServiceSupabase()
      .from("companies")
      .select("id, name, settings")
      .eq("slug", slug)
      .maybeSingle();
    return data ? brandOf(data) : PRODUCT_BRAND;
  } catch (error) {
    console.error("brand by slug failed:", error instanceof Error ? error.message : error);
    return PRODUCT_BRAND;
  }
}

function brandOf(data: CompanyRow): Brand {
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
    labForAll: settings.lab_for_all,
    devTools: settings.dev_tools,
    reportsEnabled: settings.daily_report.enabled,
  };
}
