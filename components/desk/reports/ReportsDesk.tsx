"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs, Toolbar } from "@/components/desk/ui/Toolbar";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { addDaysYmd, periodOf, type PeriodKind } from "@/lib/daily-report/format";
import { useTeamDailyReportDay, useTeamDailyReportPeriod } from "@/lib/daily-report/queries";
import type { TeamDayRow, TeamPeriodRow } from "@/lib/daily-report/types";
import { todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { useNamesKey } from "@/lib/people/names";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";

import { arrowOf, onControl, stepKey, useScreenKeys } from "../team/keys";
import { DayStepper, DayView, dayTone } from "./DayView";
import { PeriodControls, PeriodView, rateTone } from "./PeriodView";

type Tab = "day" | "period";
type DayShow = "all" | "owe" | "in";
type PeriodShow = "all" | "gaps" | "clean";

const TABS: { value: Tab; label: string }[] = [
  { value: "day", label: "День" },
  { value: "period", label: "Период" },
];

const normalise = (text: string) => text.toLowerCase().replace(/ё/g, "е").trim();
const ROWS = '[data-testid="desk-reports-day"] [data-row-key], [data-testid="desk-reports-period"] [data-row-key]';

/** A person by the words typed: the name, the position — every word somewhere in them. */
function matches(row: { full_name: string; position: string | null }, query: string): boolean {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = normalise(`${row.full_name} ${row.position ?? ""}`);
  return words.every((word) => hay.includes(word));
}

/**
 * «Отчёты» on the desk (D-152, D-154; wave 3): the director's day and period as the desk reads
 * them — one hero in the tone of the moment, the people as a table below. Over the same hooks as
 * the phone's screen; the tab lives in the address (`?tab=period`), the person open in the panel
 * too (`?p=<id>` — where «Команда» and the card lead; it stays open across the tabs). Filters by
 * people: the words typed (F) and who has the report or not. ← and → step through the days (or
 * the weeks and months), T — back to today, ↑/↓ — the people (the panel follows), Enter or Space
 * — open the chosen one.
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
  // the last day of a week or a month on screen; null — today, followed to midnight
  const [anchor, setAnchor] = useState<Ymd | null>(null);
  const range = kind === "custom" && custom ? custom : periodOf(kind === "month" ? "month" : "week", anchor ?? today);
  const [query, setQuery] = useState("");
  const [dayShow, setDayShow] = useState<DayShow>("all");
  const [periodShow, setPeriodShow] = useState<PeriodShow>("all");
  const [selected, setSelected] = useState<string | null>(openId);
  const searchField = useRef<HTMLInputElement>(null);

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
    if (person) query.set("p", person);
    const text = query.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  };
  const onDate = (next: Ymd) => setPicked(next >= today ? null : next);
  const step = (dir: -1 | 1) => {
    if (tab === "day") {
      onDate(addDaysYmd(date, dir));
      return;
    }
    if (kind === "custom") return;
    const next = addDaysYmd(anchor ?? today, dir * (kind === "month" ? 30 : 7));
    setAnchor(next >= today ? null : next);
  };
  const open = (id: string | null) => {
    if (id) setSelected(id);
    if (id !== openId) address({ p: id });
  };
  const choose = (id: string) => {
    setSelected(id);
    // the panel follows the choice while it is open
    if (openId && openId !== id) address({ p: id });
  };

  const dayFilter = (row: TeamDayRow) =>
    matches(row, query) && (dayShow === "all" || (dayShow === "in" ? row.state === "submitted" : row.state === "missed" || row.state === "pending"));
  const periodFilter = (row: TeamPeriodRow) => matches(row, query) && (periodShow === "all" || (periodShow === "gaps" ? row.missed > 0 : row.missed === 0 && row.submitted > 0));
  const dayRows = day.data?.rows ?? [];
  const periodRows = period.data?.rows ?? [];

  const chosenId = selected ?? openId;
  useScreenKeys(
    (event) => {
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        step(event.code === "ArrowLeft" ? -1 : 1);
        return true;
      }
      if (event.code === "KeyT") {
        if (tab === "day") setPicked(null);
        else setAnchor(null);
        return true;
      }
      if (event.code === "KeyF") {
        searchField.current?.focus();
        return true;
      }
      const arrow = arrowOf(event);
      if (arrow) {
        const keys = [...document.querySelectorAll<HTMLElement>(ROWS)].map((row) => row.dataset.rowKey ?? "");
        const next = stepKey(keys, chosenId, arrow === "down");
        if (next) choose(next);
        return Boolean(next);
      }
      if ((event.code === "Enter" || event.code === "NumpadEnter" || event.code === "Space") && chosenId && !onControl(event.target)) {
        open(event.code === "Space" && openId === chosenId ? null : chosenId);
        return true;
      }
      return false;
    },
    hydrated && !off,
  );
  useShortcuts("Отчёты", [
    { keys: ["←", "→"], label: tab === "day" ? "Предыдущий / следующий день" : "Предыдущий / следующий период" },
    { keys: ["T"], label: tab === "day" ? "К сегодня" : "К текущему периоду" },
    { keys: ["↑", "↓"], label: "Выбрать человека" },
    { keys: ["Enter"], label: "Открыть отчёт в панели" },
    { keys: ["F"], label: "Найти человека" },
  ]);

  const light = !hydrated || off ? null : tab === "day" ? dayTone(day.data) : rateTone(period.data?.totals.submit_rate);
  const owe = dayRows.filter((row) => row.state === "missed" || row.state === "pending").length;
  const handed = dayRows.filter((row) => row.state === "submitted").length;
  const gaps = periodRows.filter((row) => row.missed > 0).length;
  const clean = periodRows.filter((row) => row.missed === 0 && row.submitted > 0).length;

  const search = <SearchField ref={searchField} value={query} onChange={setQuery} placeholder="Найти человека  ·  F" width={240} aria-label="Найти человека" />;

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
                onStep={step}
                atToday={anchor === null}
                onToday={() => setAnchor(null)}
                today={today}
                now={now}
              />
            )}
          </Toolbar>
          {tab === "day" ? (
            <DayView
              filters={
                <Toolbar end={<span className="nums text-[13px] leading-4 text-muted">{day.data ? `${dayRows.filter(dayFilter).length} из ${dayRows.length}` : " "}</span>}>
                  <SegmentTabs<DayShow>
                    aria-label="Кого показать"
                    value={dayShow}
                    onChange={setDayShow}
                    items={[
                      { value: "all", label: "Все" },
                      { value: "owe", label: "Без отчёта", count: day.data ? owe : undefined },
                      { value: "in", label: "Сдали", count: day.data ? handed : undefined },
                    ]}
                  />
                  {search}
                </Toolbar>
              }
              day={day.data}
              stale={day.isPlaceholderData}
              failed={day.isError && !day.data}
              onRetry={() => void day.refetch()}
              filter={dayFilter}
              narrowed={Boolean(query) || dayShow !== "all"}
              onClear={() => {
                setQuery("");
                setDayShow("all");
              }}
              selectedId={chosenId}
              openId={openId}
              onSelect={choose}
              onOpen={open}
              onClose={() => address({ p: null })}
              pointsOn={pointsEnabled}
            />
          ) : (
            <PeriodView
              filters={
                <Toolbar end={<span className="nums text-[13px] leading-4 text-muted">{period.data ? `${periodRows.filter(periodFilter).length} из ${periodRows.length}` : " "}</span>}>
                  <SegmentTabs<PeriodShow>
                    aria-label="Кого показать"
                    value={periodShow}
                    onChange={setPeriodShow}
                    items={[
                      { value: "all", label: "Все" },
                      { value: "gaps", label: "С пропусками", count: period.data ? gaps : undefined },
                      { value: "clean", label: "Без пропусков", count: period.data ? clean : undefined },
                    ]}
                  />
                  {search}
                </Toolbar>
              }
              period={period.data}
              stale={period.isPlaceholderData}
              failed={period.isError && !period.data}
              onRetry={() => void period.refetch()}
              filter={periodFilter}
              narrowed={Boolean(query) || periodShow !== "all"}
              onClear={() => {
                setQuery("");
                setPeriodShow("all");
              }}
              selectedId={chosenId}
              openId={openId}
              onSelect={choose}
              onOpen={open}
              onClose={() => address({ p: null })}
              onDay={(ymd) => {
                setPicked(ymd >= today ? null : ymd);
                address({ tab: "day" });
              }}
              pointsOn={pointsEnabled}
              now={now}
            />
          )}
        </div>
      )}
    </DeskPage>
  );
}
