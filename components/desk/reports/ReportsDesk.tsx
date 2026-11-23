"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, ViewTransition } from "react";

import { useDeskParams, writeDeskAddress } from "@/components/desk/DeskAddress";
import { useDeskScope } from "@/components/desk/DeskScope";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { IconButton } from "@/components/desk/ui/IconButton";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs, Toolbar } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { stepType, SWITCH_OR_STEP } from "@/lib/desk/motion";
import { askFromOf } from "@/lib/daily-report/due";
import { addDaysYmd } from "@/lib/daily-report/format";
import { hasTeamDailyReportDay, prefetchTeamDailyReportDay, useTeamDailyReportDay } from "@/lib/daily-report/queries";
import { nowHm, todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { dayFileName, daySheet, daySheetTitle, tabelFileName, tabelSheet, tabelSheetTitle, toCsv } from "@/lib/desk/report-export";
import {
  autoDay,
  currentPeriod,
  holdsToday,
  periodRange,
  readAddress,
  stepPeriod,
  writeAddress,
  type ReportsAddress,
  type ReportsTab,
  type TabelPeriod,
} from "@/lib/desk/reports-address";
import { useCompanyCard } from "@/lib/desk/settings-queries";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { useNamesKey } from "@/lib/people/names";
import { personFits } from "@/lib/people/search";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";
import { useNow } from "@/lib/useNow";

import { arrowOf, onControl, stepKey, useScreenKeys } from "../team/keys";
import { Diary } from "./Diary";
import { PrintSheet, saveCsv } from "./PrintSheet";
import { DayStepper, PeriodControls } from "./ReportsHead";
import { SummaryView } from "./SummaryView";
import { useTabel } from "./tabel-data";
import { TabelView, type TabelShow } from "./TabelView";

const TABS: { value: ReportsTab; label: string }[] = [
  { value: "day", label: "День" },
  { value: "tabel", label: "Табель" },
];

const ROWS = '[data-testid="desk-reports-day"] [data-row-key], [data-testid="desk-tabel"] [data-row-key]';

/**
 * «Отчёты» on the desk (D-152; D-183): two forms of the same reports and one of a person.
 * «День» — «Сводка»: what the team wrote that day as a journal, the roll call beside it (who has
 * not handed in, who is away, «Напомнить»). «Табель» — people × days of a calendar month, a
 * Monday–Sunday week or one's own stretch, as the accountant keeps it. A person — «Дневник» in the
 * shell's right panel, the same on both tabs. Everything on screen is in the address (`?day`,
 * `?tab=tabel&month|week|from&to`, `?p`): «Назад», a reload and a link open the same. Without a
 * day the morning rule picks it once (lib/desk/reports-address.ts). ← → step, T — today, F —
 * search, ↑ ↓ — people, Enter — the diary. «Скачать для Excel» and «Печать» hand out what is shown,
 * without points (a minus is not public, D-152).
 */
export function ReportsDesk() {
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const { pointsEnabled } = useDeskScope();
  const me = useMe();
  const now = useNow();
  const today = todayYmd(now);
  const pathname = usePathname();
  const params = useDeskParams();
  const address = readAddress(new URLSearchParams(params.toString()));
  const { tab } = address;
  const openId = address.person;

  const settings = useCompanySettings();
  const rules = settings.data?.daily_report;
  const askFrom = askFromOf(rules?.ask_from);
  // the module switched off: the screen says so and asks the database nothing (it would refuse)
  const off = rules?.enabled === false;
  // the day and its words come from this computer's clock: the server's HTML is the skeleton
  const hydrated = useHydrated();

  // the morning rule, decided once the rules have come — it does not jump at 17:00 while one reads
  const [auto, setAuto] = useState<Ymd | null>(null);
  if (auto === null && hydrated && rules) setAuto(autoDay(rules, today, nowHm(now), askFrom));
  const date: Ymd = address.day ?? auto ?? today;
  const autoFrom = !address.day && auto && auto !== today ? auto : null;

  const period: TabelPeriod = address.period ?? currentPeriod("month", today);
  const range = periodRange(period);
  const [query, setQuery] = useState("");
  const [tabelShow, setTabelShow] = useState<TabelShow>("all");
  const [selected, setSelected] = useState<string | null>(openId);
  const searchField = useRef<HTMLInputElement>(null);
  const company = useCompanyCard();

  const companyId = me.data?.companyId;
  const day = useTeamDailyReportDay(date, companyId, hydrated && tab === "day" && !off);
  // the days on both sides, loaded ahead: a step of days slides in with its reports there (D-184)
  const queryClient = useQueryClient();
  const asksDays = hydrated && tab === "day" && !off && Boolean(companyId);
  useEffect(() => {
    if (!asksDays) return;
    void prefetchTeamDailyReportDay(queryClient, addDaysYmd(date, -1));
    if (addDaysYmd(date, 1) <= today) void prefetchTeamDailyReportDay(queryClient, addDaysYmd(date, 1));
  }, [asksDays, queryClient, date, today]);
  const tabel = useTabel(range.from, range.to, today, hydrated && tab === "tabel" && Boolean(companyId) && !off);

  /**
   * Writes the address without a trip to the server: only what changed. Each move is a step of the
   * browser's history, so «Назад» goes back to the day, the period or the diary before it; a held
   * arrow key replaces its own step instead of stacking dozens. Through the desk's address (D-184):
   * «Сводка» ↔ «Табель» swap as two pictures, another person's diary changes in the panel in place
   * (a held arrow — at once); a day or a period changes at once, its data is on its way anyway.
   */
  const go = (next: Partial<ReportsAddress>, replace = false) => {
    // from the address as it is now, not as drawn: another person may still wait for its transition
    const current = readAddress(new URLSearchParams(window.location.search));
    const merged: ReportsAddress = { ...current, day: current.day, period: current.period, ...next };
    const text = writeAddress(merged);
    const url = text ? `${pathname}?${text}` : pathname;
    if (url === `${pathname}${window.location.search}`) return;
    const switched = next.tab !== undefined && next.tab !== tab;
    const picked = !switched && next.person !== undefined && next.person !== openId && Boolean(next.person && openId);
    // a day of «Сводка» already here slides the way the step goes; one still to load changes at once
    const stepped = !switched && !picked && tab === "day" && next.day && next.day !== date && hasTeamDailyReportDay(queryClient, next.day) ? stepType(date, next.day) : undefined;
    writeDeskAddress(url, { push: !replace, type: switched ? "desk-switch" : picked ? "desk-pick" : stepped, burst: replace });
  };
  const setDay = (next: Ymd, replace = false) => go({ day: next > today ? today : next }, replace);
  const setPeriod = (next: TabelPeriod, replace = false) => go({ period: next }, replace);
  const step = (dir: -1 | 1, replace = false) => {
    if (tab === "day") {
      setDay(addDaysYmd(date, dir), replace);
      return;
    }
    if (period.kind === "custom") return;
    const next = stepPeriod(period, dir);
    if (periodRange(next).from > today) return;
    setPeriod(next, replace);
  };
  const toToday = () => (tab === "day" ? setDay(today) : setPeriod(currentPeriod(period.kind === "custom" ? "month" : period.kind, today)));
  const open = (id: string | null) => {
    if (id) setSelected(id);
    if (id !== openId) go({ person: id });
  };
  const choose = (id: string, replace = false) => {
    setSelected(id);
    // the panel follows the choice while it is open; walking the people with ↑/↓ is one step of history
    if (openId && openId !== id) go({ person: id }, replace);
  };
  const match = (row: { full_name: string; position: string | null }) => personFits(row, query);

  const chosenId = selected ?? openId;
  useScreenKeys(
    (event) => {
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        step(event.code === "ArrowLeft" ? -1 : 1, event.repeat);
        return true;
      }
      if (event.code === "KeyT") {
        toToday();
        return true;
      }
      if (event.code === "KeyF") {
        searchField.current?.focus();
        return true;
      }
      const arrow = arrowOf(event);
      if (arrow) {
        const keys = [...new Set([...document.querySelectorAll<HTMLElement>(ROWS)].map((row) => row.dataset.rowKey ?? ""))].filter(Boolean);
        const next = stepKey(keys, chosenId, arrow === "down");
        if (next) choose(next, true);
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
    { keys: ["T"], label: tab === "day" ? "К сегодняшнему дню" : "К периоду с сегодняшним днём" },
    { keys: ["↑", "↓"], label: "Выбрать человека" },
    { keys: ["Enter"], label: "Открыть дневник человека" },
    { keys: ["F"], label: "Найти человека" },
    { keys: ["Ctrl P"], label: "Распечатать то, что на экране" },
  ]);

  // the data's own day and period, not the controls': while the next one loads the old one is on screen
  const dayRows = (day.data?.rows ?? []).filter(match);
  const tabelPeople = (tabel.data?.people ?? []).filter((person) => match(person.row) && (tabelShow === "all" || person.row.missed > 0));
  const paper =
    tab === "day"
      ? day.data && { kind: "day" as const, file: dayFileName(day.data.date), title: daySheetTitle(day.data.date), sheet: daySheet(day.data, dayRows), shown: dayRows.length, all: day.data.rows.length }
      : tabel.data && {
          kind: "tabel" as const,
          file: tabelFileName(tabel.data.from, tabel.data.to),
          title: tabelSheetTitle(tabel.data.from, tabel.data.to),
          sheet: tabelSheet(tabel.data, tabelPeople),
          shown: tabelPeople.length,
          all: tabel.data.people.length,
        };
  const waiting = tab === "day" ? day.isPlaceholderData : tabel.isPlaceholderData;
  const empty = !paper || paper.shown === 0 || waiting;

  // two icons with their words in the hint: the head stays one row at 1280 (D-183)
  const handOut = (
    <>
      <IconButton
        label={tab === "day" ? "Скачать для Excel — отчёты дня" : "Скачать для Excel — табель"}
        icon={<Download size={16} strokeWidth={2} aria-hidden />}
        disabled={empty}
        onClick={() => paper && saveCsv(paper.file, toCsv(paper.sheet))}
        testId="desk-report-csv"
      />
      <IconButton label="Распечатать то, что на экране" keys={["Ctrl P"]} icon={<Printer size={16} strokeWidth={2} aria-hidden />} disabled={empty} onClick={() => window.print()} testId="desk-report-print" />
    </>
  );

  return (
    <DeskPage>
      <PageTitle
        title="Отчёты"
        actions={
          hydrated && !off ? (
            <Toolbar end={handOut}>
              {tab === "day" ? (
                <DayStepper date={date} today={today} onDate={setDay} />
              ) : (
                <PeriodControls
                  period={period}
                  onKind={(kind) => setPeriod(kind === "custom" ? { kind: "custom", ...range } : currentPeriod(kind, range.to > today ? today : range.to))}
                  onPeriod={setPeriod}
                  onStep={step}
                  atToday={holdsToday(period, today)}
                  onToday={toToday}
                  today={today}
                  now={now}
                />
              )}
              <SearchField ref={searchField} value={query} onChange={setQuery} placeholder="Найти человека  ·  F" width={200} aria-label="Найти человека" />
              <SegmentTabs aria-label="Вид отчётов" value={tab} onChange={(next) => go({ tab: next })} items={TABS} />
            </Toolbar>
          ) : null
        }
      />
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
          <Bone h={28} w={420} />
          <Bone h={120} className="mt-3.5" />
          <Bone h={120} className="mt-3.5" />
        </SkeletonGroup>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3.5" data-testid="desk-reports">
          {/* «Сводка» and «Табель» swap as two pictures (D-184) */}
          <ViewTransition update={SWITCH_OR_STEP} default="none">
            {tab === "day" ? (
              <SummaryView
                day={day.data}
                stale={day.isPlaceholderData}
                failed={day.isError && !day.data}
                onRetry={() => void day.refetch()}
                match={match}
                selectedId={chosenId}
                openId={openId}
                onSelect={choose}
                onOpen={open}
                pointsOn={pointsEnabled}
                now={now}
                today={today}
                autoFrom={autoFrom}
                askFrom={askFrom}
                onToday={() => setDay(today)}
              />
            ) : (
              <TabelView
                tabel={tabel.data}
                stale={tabel.isPlaceholderData}
                failed={tabel.isError && !tabel.data}
                onRetry={() => void tabel.refetch()}
                match={match}
                show={tabelShow}
                onShow={setTabelShow}
                selectedId={chosenId}
                openId={openId}
                onSelect={choose}
                onOpen={open}
                onDay={(next) => go({ tab: "day", day: next > today ? today : next })}
                today={today}
              />
            )}
          </ViewTransition>
        </div>
      )}
      {hydrated && !off && openId ? (
        <InPanel panelKey={`diary:${openId}`} onClose={() => go({ person: null })}>
          <Diary
            userId={openId}
            focus={tab === "day" ? date : range.to > today ? today : range.to}
            today={today}
            onDay={(next) => go({ tab: "day", day: next > today ? today : next })}
          />
        </InPanel>
      ) : null}
      {hydrated && !off && paper ? (
        <PrintSheet company={company.data?.name} title={paper.title} note={paper.shown < paper.all ? `Показано ${paper.shown} из ${paper.all}` : null} sheet={paper.sheet} kind={paper.kind} />
      ) : null}
    </DeskPage>
  );
}
