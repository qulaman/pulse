"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import Link from "next/link";

import { useDeskScope } from "@/components/desk/DeskScope";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { SegmentTabs, Toolbar } from "@/components/desk/ui/Toolbar";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { addDaysYmd, periodOf, type PeriodKind } from "@/lib/daily-report/format";
import { useTeamDailyReportDay, useTeamDailyReportPeriod } from "@/lib/daily-report/queries";
import { todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { useNamesKey } from "@/lib/people/names";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";

import { DayStepper, DayView, dayTone } from "./DayView";
import { PeriodControls, PeriodView, rateTone } from "./PeriodView";

type Tab = "day" | "period";

const TABS: { value: Tab; label: string }[] = [
  { value: "day", label: "День" },
  { value: "period", label: "Период" },
];

/**
 * «Отчёты» on the desk (D-152, D-154): the director's day and period as the desk reads them —
 * one hero in the tone of the moment, the people as a table below. Over the same hooks as the
 * phone's screen; the tab lives in the address (`?tab=period`), the person open in the panel too
 * (`?p=<id>` — where «Команда» and the card lead), the day is followed to midnight until another
 * is picked; ← and → step through the days.
 */
export function ReportsDesk() {
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const { pointsEnabled } = useDeskScope();
  const me = useMe();
  const now = useMinute();
  const today = todayYmd(now);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const tab: Tab = params.get("tab") === "period" ? "period" : "day";
  const openId = params.get("p");
  const [picked, setPicked] = useState<Ymd | null>(null);
  const date = picked ?? today;
  const [kind, setKind] = useState<PeriodKind>("week");
  const [custom, setCustom] = useState<{ from: Ymd; to: Ymd } | null>(null);
  const range = kind === "custom" && custom ? custom : periodOf(kind === "month" ? "month" : "week", today);

  const companyId = me.data?.companyId;
  const settings = useCompanySettings();
  // the module switched off: the screen says so and asks the database nothing (it would refuse)
  const off = settings.data?.daily_report.enabled === false;
  const day = useTeamDailyReportDay(date, companyId, tab === "day" && !off);
  const period = useTeamDailyReportPeriod(range.from, range.to, tab === "period" && Boolean(companyId) && !off);

  // the day and its words come from this computer's clock: the server's HTML is the skeleton
  const hydrated = useHydrated();

  const address = (next: { tab?: Tab; p?: string | null }) => {
    const query = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    if (nextTab === "period") query.set("tab", "period");
    const person = next.p === undefined ? openId : next.p;
    if (person && nextTab === "day") query.set("p", person);
    const text = query.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  };
  const onDate = (next: Ymd) => setPicked(next >= today ? null : next);

  // ← and → step through the days while nothing else wants the keys
  useEffect(() => {
    if (tab !== "day") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || isTypingTarget(event.target)) return;
      if (document.body.hasAttribute("data-dialog-open") || document.body.hasAttribute("data-sheet-open")) return;
      if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;
      event.preventDefault();
      setPicked((was) => {
        const current = was ?? today;
        const next = addDaysYmd(current, event.code === "ArrowLeft" ? -1 : 1);
        return next >= today ? null : next;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, today]);

  const light = !hydrated || off ? null : tab === "day" ? dayTone(day.data) : rateTone(period.data?.totals.submit_rate);

  return (
    <DeskPage>
      <PageTitle title="Отчёты" light={light} />
      {off ? (
        <EmptyState
          title="Отчёты за день выключены"
          hint="Включаются в настройках компании: рабочие дни, начало дня и напоминание — там же"
          action={
            <Link href="/desk/settings?tab=team">
              <Button size="sm" variant="secondary">
                Открыть настройки
              </Button>
            </Link>
          }
        />
      ) : !hydrated ? (
        <SkeletonGroup grow>
          <Bone h={36} w={520} className="rounded-[11px]" />
          <Bone h={120} className="mt-5 rounded-[16px]" />
          <Bone h={320} className="mt-5 rounded-[12px]" />
        </SkeletonGroup>
      ) : (
        <div className="flex flex-col gap-5" data-testid="desk-reports">
          <Toolbar>
            <SegmentTabs aria-label="Вид отчётов" value={tab} onChange={(next) => address({ tab: next })} items={TABS} />
            <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            {tab === "day" ? (
              <DayStepper date={date} today={today} onDate={onDate} />
            ) : (
              <PeriodControls
                kind={kind}
                onKind={(next) => {
                  // «Свой» starts from what is on screen, so the first pick moves one end only
                  if (next === "custom" && !custom) setCustom(range);
                  setKind(next);
                }}
                range={range}
                onRange={setCustom}
                today={today}
                now={now}
              />
            )}
          </Toolbar>
          {tab === "day" ? (
            <DayView
              day={day.data}
              stale={day.isPlaceholderData}
              failed={day.isError && !day.data}
              onRetry={() => void day.refetch()}
              openId={openId}
              onOpen={(id) => {
                if (id !== openId) address({ p: id });
              }}
              onClose={() => address({ p: null })}
              pointsOn={pointsEnabled}
            />
          ) : (
            <PeriodView
              period={period.data}
              stale={period.isPlaceholderData}
              failed={period.isError && !period.data}
              onRetry={() => void period.refetch()}
              pointsOn={pointsEnabled}
              now={now}
            />
          )}
        </div>
      )}
    </DeskPage>
  );
}
