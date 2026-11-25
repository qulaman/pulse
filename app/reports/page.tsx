import { TeamReportsScreen } from "@/components/daily-report/TeamReportsScreen";

/**
 * «Отчёты» (D-152, D-198): the team's daily reports — all of them in a row, or a period. The view
 * lives in the address (`?tab=period`, `?who`, `?only=new`, `?day`), read by the screen itself;
 * the layout lets only the director in.
 */
export default function ReportsPage() {
  return <TeamReportsScreen />;
}
