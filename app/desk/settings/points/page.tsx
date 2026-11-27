import { redirect } from "next/navigation";

/**
 * «Очки и магазин» lived here until its two halves became sections of the navigation (D-215): the
 * address leads on — `?view=shop` to «Магазин», everything else to «Рейтинг» with its view.
 */
export default async function DeskPointsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  if (view === "shop") redirect("/desk/shop");
  redirect(view === "disputes" || view === "history" ? `/desk/rating?view=${view}` : "/desk/rating");
}
