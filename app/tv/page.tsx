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

  // название и логотип берутся на сервере: роль `tv` таблицу companies не читает
  const brand = await loadBrand();
  return (
    <TvScreen company={brand.name} guest={guest === "1"} logoUrl={brand.logoUrl} role={profile.role} />
  );
}
