"use client";

import { PageHead } from "@/components/ui/PageHead";
import type { PeriodKind } from "@/lib/daily-report/format";
import type { TeamDay, TeamPeriod } from "@/lib/daily-report/types";
import type { Ymd } from "@/lib/datetime/calendar";

import { Segments } from "./Segments";
import { TeamDayPanel } from "./TeamDayPanel";
import { TeamPeriodPanel } from "./TeamPeriodPanel";

export type ReportsTab = "day" | "period";

const TABS = [
  { key: "day", label: "День" },
  { key: "period", label: "Период" },
] as const;

/**
 * «Отчёты» of the director (D-152): «День» — who handed the report in today (or any day), what
 * each did; «Период» — the team's productivity over a week, a month or any stretch. The data is
 * the page's (`useTeamDailyReportDay`, `useTeamDailyReportPeriod`).
 */
export function TeamReportsView({
  tab,
  onTab,
  today,
  now,
  date,
  onDate,
  day,
  dayStale,
  dayFailed,
  onRetryDay,
  periodKind,
  onPeriodKind,
  range,
  onRange,
  period,
  periodStale,
  periodFailed,
  onRetryPeriod,
  bare = false,
}: {
  tab: ReportsTab;
  onTab: (tab: ReportsTab) => void;
  today: Ymd;
  now: Date;
  date: Ymd;
  onDate: (date: Ymd) => void;
  day: TeamDay | undefined;
  dayStale?: boolean;
  dayFailed?: boolean;
  onRetryDay?: () => void;
  periodKind: PeriodKind;
  onPeriodKind: (kind: PeriodKind) => void;
  range: { from: Ymd; to: Ymd };
  onRange: (range: { from: Ymd; to: Ymd }) => void;
  period: TeamPeriod | undefined;
  periodStale?: boolean;
  periodFailed?: boolean;
  onRetryPeriod?: () => void;
  /** The view alone, for a screen with a frame of its own (the desk, D-153): no <main>, no head. */
  bare?: boolean;
}) {
  const view = (
    <>
      <Segments id="reports-tab" label="Вид отчётов" items={TABS} value={tab} onChange={onTab} className="mt-3" />
      <div className="mt-4">
        {tab === "day" ? (
          <TeamDayPanel date={date} today={today} onDate={onDate} day={day} stale={dayStale} failed={dayFailed} onRetry={onRetryDay} />
        ) : (
          <TeamPeriodPanel
            kind={periodKind}
            onKind={onPeriodKind}
            range={range}
            onRange={onRange}
            today={today}
            period={period}
            stale={periodStale}
            failed={periodFailed}
            onRetry={onRetryPeriod}
            now={now}
          />
        )}
      </div>
    </>
  );
  if (bare) return view;
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Отчёты" />
      {view}
    </main>
  );
}
