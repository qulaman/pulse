import { TeamReportsScreen } from "@/components/daily-report/TeamReportsScreen";

/**
 * «Отчёты» (D-152): the team's daily reports — a day, or a period. `?tab=period` opens the
 * period directly; the layout lets only the director in.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  const key = Array.isArray(tab) ? tab[0] : tab;
  return <TeamReportsScreen initialTab={key === "period" ? "period" : "day"} />;
}
