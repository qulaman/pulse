import { redirect } from "next/navigation";

import { TvScreen } from "@/components/tv/TvScreen";
import { AuthError, getSessionProfile } from "@/lib/auth";
import { loadBrand } from "@/lib/brand";

/**
 * `/tv` — ТВ-режим. Что показывать, решает строка `tv_state` с пульта директора (D-76);
 * `?guest=1` остаётся стартовым значением «Посетителя» до прихода этой строки.
 *
 * Роль читается второй раз (её уже читал layout): квитанцию экрана оставляет только
 * киоск роли `tv`, а директору с ноутбука расписываться за стену нечем. Layout своей
 * роли ребёнку передать не может — две строки дубля дешевле, чем контекст ради них.
 */
export default async function TvPage({ searchParams }: { searchParams: Promise<{ guest?: string }> }) {
  const { guest } = await searchParams;

  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  // the name and the logo are read on the server (the `tv` role does not read companies) — of the
  // kiosk's own company, not of the first one in the shared base (D-134)
  const brand = await loadBrand(profile.companyId);
  return (
    <TvScreen company={brand.name} guest={guest === "1"} logoUrl={brand.logoUrl} role={profile.role} />
  );
}
