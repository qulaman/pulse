"use client";

import { useState } from "react";

import { useMinute } from "@/components/tasks/list/TaskList";
import { periodOf, type PeriodKind } from "@/lib/daily-report/format";
import { useTeamDailyReportDay, useTeamDailyReportPeriod } from "@/lib/daily-report/queries";
import { todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { useNamesKey } from "@/lib/people/names";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";

import { ReportsSkeleton } from "./Skeletons";
import { TeamReportsView, type ReportsTab } from "./TeamReportsView";

/**
 * «Отчёты» with its data: the tab in the address (`?tab=period`, swapped in place like
 * «Настройки»), the day the director looks at — today until another is picked, so the screen
 * follows midnight — and the period.
 */
export function TeamReportsScreen({ initialTab }: { initialTab: ReportsTab }) {
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const me = useMe();
  const now = useMinute();
  const today = todayYmd(now);

  const [tab, setTab] = useState<ReportsTab>(initialTab);
  const [picked, setPicked] = useState<Ymd | null>(null);
  const date = picked ?? today;
  const [kind, setKind] = useState<PeriodKind>("week");
  const [custom, setCustom] = useState<{ from: Ymd; to: Ymd } | null>(null);
  const range = kind === "custom" && custom ? custom : periodOf(kind === "month" ? "month" : "week", today);

  const companyId = me.data?.companyId;
  const day = useTeamDailyReportDay(date, companyId, tab === "day");
  const period = useTeamDailyReportPeriod(range.from, range.to, tab === "period" && Boolean(companyId));

  // the day and its words come from the phone's clock: the server's HTML is the skeleton
  const hydrated = useHydrated();
  if (!hydrated) return <ReportsSkeleton />;

  const chooseTab = (next: ReportsTab) => {
    setTab(next);
    window.history.replaceState(window.history.state, "", next === "day" ? "/reports" : "/reports?tab=period");
  };

  return (
    <TeamReportsView
      tab={tab}
      onTab={chooseTab}
      today={today}
      now={now}
      date={date}
      onDate={(next) => setPicked(next === today ? null : next)}
      day={day.data}
      dayStale={day.isPlaceholderData}
      dayFailed={day.isError && !day.data}
      onRetryDay={() => void day.refetch()}
      periodKind={kind}
      onPeriodKind={(next) => {
        // «Свой» starts from what is on screen, so the first pick moves one end only
        if (next === "custom" && !custom) setCustom(range);
        setKind(next);
      }}
      range={range}
      onRange={setCustom}
      period={period.data}
      periodStale={period.isPlaceholderData}
      periodFailed={period.isError && !period.data}
      onRetryPeriod={() => void period.refetch()}
    />
  );
}
