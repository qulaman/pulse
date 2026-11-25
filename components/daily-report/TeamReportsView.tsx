"use client";

import { PageHead } from "@/components/ui/PageHead";
import type { PeriodKind } from "@/lib/daily-report/format";
import type { ReportsFeed } from "@/lib/daily-report/review";
import type { ReportsAddress, ReportsTab } from "@/lib/daily-report/team-feed";
import type { TeamPeriod } from "@/lib/daily-report/types";
import type { Ymd } from "@/lib/datetime/calendar";

import { Segments } from "./Segments";
import { TeamFeedPanel } from "./TeamFeedPanel";
import { TeamPeriodPanel } from "./TeamPeriodPanel";

export const REPORTS_TABS = [
  { key: "feed", label: "Подряд" },
  { key: "period", label: "Период" },
] as const satisfies readonly { key: ReportsTab; label: string }[];

/**
 * «Отчёты» of the director on the phone (D-152, D-198): «Подряд» — every report, days in a row
 * down, today on top, the words in sight, «Проверить» on each; «Период» — the team over a week,
 * a month or any stretch, a person's row leads to their reports. The data is the page's.
 */
export function TeamReportsView({
  address,
  onTab,
  onPerson,
  onUnchecked,
  today,
  now,
  companyId,
  feed,
  uncheckedCount,
  periodKind,
  onPeriodKind,
  range,
  onRange,
  period,
  periodStale,
  periodFailed,
  onRetryPeriod,
}: {
  address: ReportsAddress;
  onTab: (tab: ReportsTab) => void;
  onPerson: (userId: string | null) => void;
  onUnchecked: (on: boolean) => void;
  today: Ymd;
  now: Date;
  companyId: string | undefined;
  feed: ReportsFeed;
  uncheckedCount: number | undefined;
  periodKind: PeriodKind;
  onPeriodKind: (kind: PeriodKind) => void;
  range: { from: Ymd; to: Ymd };
  onRange: (range: { from: Ymd; to: Ymd }) => void;
  period: TeamPeriod | undefined;
  periodStale?: boolean;
  periodFailed?: boolean;
  onRetryPeriod?: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Отчёты" />
      <Segments id="reports-tab" label="Вид отчётов" items={REPORTS_TABS} value={address.tab} onChange={onTab} className="mt-3" />
      <div className="mt-2.5">
        {address.tab === "feed" ? (
          <TeamFeedPanel
            // a filter starts its own list: the reports folded under «Не проверены» belong to it
            key={`${address.who ?? ""}:${address.unchecked}`}
            address={address}
            onPerson={onPerson}
            onUnchecked={onUnchecked}
            today={today}
            now={now}
            companyId={companyId}
            feed={feed}
            uncheckedCount={uncheckedCount}
          />
        ) : (
          <div className="mt-1.5">
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
              onPerson={(userId) => onPerson(userId)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
