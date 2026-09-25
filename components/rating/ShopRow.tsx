import Link from "next/link";

/** «Магазин» under «Рейтинг» (D-71) — the page's and the skeleton's same row (D-122). */
export function ShopRow() {
  return (
    <Link href="/shop" className="mt-4 flex min-h-[48px] items-center justify-between card px-4 text-[16px] leading-[22px]">
      Магазин
      <span className="text-[13px] leading-4 text-muted">обменять очки ›</span>
    </Link>
  );
}
