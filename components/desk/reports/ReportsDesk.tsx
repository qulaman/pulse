"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { TeamReportsView, type ReportsTab } from "@/components/daily-report/TeamReportsView";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { periodOf, type PeriodKind } from "@/lib/daily-report/format";
import { useTeamDailyReportDay, useTeamDailyReportPeriod } from "@/lib/daily-report/queries";
import { todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { useNamesKey } from "@/lib/people/names";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";

/** The phone's «Отчёты» view without its frame (`bare`): the desk's title, a column of 1100 px. */
const DESK_FRAME = "w-full max-w-[1100px] [&_[role=tablist]]:max-w-[420px]";

/**
 * «Отчёты» on the desk (D-152, D-153): the director's day and period over the same hooks as
 * the phone's `TeamReportsScreen` — the tab in the address (`?tab=period`), the day followed to
 * midnight until another is picked. The phone screen writes `/reports` into the address bar, so
 * the desk keeps its own state here and hands the same props to the same view.
 */
export function ReportsDesk() {
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const me = useMe();
  const now = useMinute();
  const today = todayYmd(now);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const tab: ReportsTab = params.get("tab") === "period" ? "period" : "day";
  const [picked, setPicked] = useState<Ymd | null>(null);
  const date = picked ?? today;
  const [kind, setKind] = useState<PeriodKind>("week");
  const [custom, setCustom] = useState<{ from: Ymd; to: Ymd } | null>(null);
  const range = kind === "custom" && custom ? custom : periodOf(kind === "month" ? "month" : "week", today);

  const companyId = me.data?.companyId;
  const day = useTeamDailyReportDay(date, companyId, tab === "day");
  const period = useTeamDailyReportPeriod(range.from, range.to, tab === "period" && Boolean(companyId));

  // the day and its words come from this computer's clock: the server's HTML is the skeleton
  const hydrated = useHydrated();

  return (
    <DeskPage>
      <PageTitle title="Отчёты" />
      {!hydrated ? (
        <SkeletonGroup grow className="max-w-[1100px]">
          <Bone h={50} w={420} className="rounded-[14px]" />
          <Bone h={320} className="mt-4 rounded-[16px]" />
        </SkeletonGroup>
      ) : (
        <div className={DESK_FRAME} data-testid="desk-reports">
          <TeamReportsView
            tab={tab}
            onTab={(next) => router.replace(next === "day" ? pathname : `${pathname}?tab=period`, { scroll: false })}
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
            bare
          />
        </div>
      )}
    </DeskPage>
  );
}
