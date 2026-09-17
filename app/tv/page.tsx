import { TvScreen } from "@/components/tv/TvScreen";
import { loadBrand } from "@/lib/brand";

/**
 * `/tv` — ТВ-режим. Гостевой режим пока приходит стартовым параметром `?guest=1`:
 * переключатель «Посетитель» живёт в пульте директора, а пульт — следующий шаг (D-33).
 */
export default async function TvPage({ searchParams }: { searchParams: Promise<{ guest?: string }> }) {
  const { guest } = await searchParams;
  // название компании берётся на сервере: роль `tv` таблицу companies не читает
  const brand = await loadBrand();
  return <TvScreen company={brand.name} guest={guest === "1"} />;
}
