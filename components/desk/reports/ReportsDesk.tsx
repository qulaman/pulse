"use client";

import { Download, Printer } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { useDeskScope } from "@/components/desk/DeskScope";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs, Toolbar } from "@/components/desk/ui/Toolbar";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { addDaysYmd, periodOf, type PeriodKind } from "@/lib/daily-report/format";
import { useTeamDailyReportDay, useTeamDailyReportPeriod } from "@/lib/daily-report/queries";
import type { TeamDayRow, TeamPeriodRow } from "@/lib/daily-report/types";
import { todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { dayFileName, daySheet, daySheetTitle, inOrder, periodFileName, periodSheet, periodSheetTitle, toCsv } from "@/lib/desk/report-export";
import { useCompanyCard } from "@/lib/desk/settings-queries";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { useNamesKey } from "@/lib/people/names";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";

import { arrowOf, onControl, stepKey, useScreenKeys } from "../team/keys";
import { DayStepper, DayView, type DayShow } from "./DayView";
import { PeriodControls, PeriodView } from "./PeriodView";
import { PrintSheet, saveCsv } from "./PrintSheet";

type Tab = "day" | "period";
type PeriodShow = "all" | "gaps" | "clean";

const TABS: { value: Tab; label: string }[] = [
  { value: "day", label: "День" },
  { value: "period", label: "Период" },
];

const normalise = (text: string) => text.toLowerCase().replace(/ё/g, "е").trim();
const ROWS = '[data-testid="desk-reports-day"] [data-row-key], [data-testid="desk-reports-period"] [data-row-key]';
const NO_ORDER: readonly string[] = [];

/** The people as the table stands right now, its sort included: the table keeps that to itself. */
const shownKeys = () => [...document.querySelectorAll<HTMLElement>(ROWS)].map((row) => row.dataset.rowKey ?? "");

/** A person by the words typed: the name, the position — every word somewhere in them. */
function matches(row: { full_name: string; position: string | null }, query: string): boolean {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = normalise(`${row.full_name} ${row.position ?? ""}`);
  return words.every((word) => hay.includes(word));
}

/**
 * «Отчёты» on the desk (D-152, D-154; wave 3, D-158): the director's day and period as the desk
 * reads them — one total, the people as a table right under it; which day and which view stand in
 * the head of the sheet, beside the title. Over the same hooks as
 * the phone's screen; the tab lives in the address (`?tab=period`), the person open in the panel
 * too (`?p=<id>` — where «Команда» and the card lead; it stays open across the tabs). Filters by
 * people: the words typed (F) and who has the report or not. ← and → step through the days (or
 * the weeks and months), T — back to today, ↑/↓ — the people (the panel follows), Enter or Space
 * — open the chosen one. «Скачать для Excel» and «Печать» hand out what is shown: the filters, the
 * search and the table's sort, every column whatever the window has hidden (lib/desk/report-export.ts).
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
  const [printOrder, setPrintOrder] = useState(NO_ORDER);
  const searchField = useRef<HTMLInputElement>(null);
  const company = useCompanyCard();

  const companyId = me.data?.companyId;
  const settings = useCompanySettings();
  // the module switched off: the screen says so and asks the database nothing (it would refuse)
  const off = settings.data?.daily_report.enabled === false;
  const day = useTeamDailyReportDay(date, companyId, tab === "day" && !off);
  const period = useTeamDailyReportPeriod(range.from, range.to, tab === "period" && Boolean(companyId) && !off);

  // the day and its words come from this computer's clock: the server's HTML is the skeleton
  const hydrated = useHydrated();

  // the button and Ctrl+P alike: the sheet takes the table's order at the moment of printing
  useEffect(() => {
    const beforePrint = () => flushSync(() => setPrintOrder(shownKeys()));
    window.addEventListener("beforeprint", beforePrint);
    return () => window.removeEventListener("beforeprint", beforePrint);
  }, []);

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
    { keys: ["Ctrl P"], label: "Распечатать то, что на экране" },
  ]);

  const owe = dayRows.filter((row) => row.state === "missed" || row.state === "pending").length;
  const handed = dayRows.filter((row) => row.state === "submitted").length;
  const gaps = periodRows.filter((row) => row.missed > 0).length;
  const clean = periodRows.filter((row) => row.missed === 0 && row.submitted > 0).length;
  const shownDay = dayRows.filter(dayFilter);
  const shownPeriod = periodRows.filter(periodFilter);

  // the data's own day and period, not the controls': while the next one loads the old one is on screen
  const sheetOf = (keys: readonly string[]) =>
    tab === "day"
      ? day.data && { file: dayFileName(day.data.date), title: daySheetTitle(day.data.date), sheet: daySheet(inOrder(shownDay, (row) => row.user_id, keys), { pointsOn: pointsEnabled }) }
      : period.data && {
          file: periodFileName(period.data.from, period.data.to),
          title: periodSheetTitle(period.data.from, period.data.to),
          sheet: periodSheet(inOrder(shownPeriod, (row) => row.user_id, keys), { pointsOn: pointsEnabled }),
        };
  const paper = sheetOf(printOrder);
  const [shownCount, allCount, waiting] = tab === "day" ? [shownDay.length, dayRows.length, day.isPlaceholderData] : [shownPeriod.length, periodRows.length, period.isPlaceholderData];
  const download = () => {
    const made = sheetOf(shownKeys());
    if (made) saveCsv(made.file, toCsv(made.sheet));
  };
  const handOut = (
    <>
      <Button size="sm" variant="secondary" icon={<Download size={15} strokeWidth={2} aria-hidden />} disabled={shownCount === 0 || waiting} onClick={download} data-testid="desk-report-csv">
        Скачать для Excel
      </Button>
      <Tooltip label="Распечатать то, что на экране" keys={["Ctrl P"]} side="bottom">
        <Button size="sm" variant="secondary" icon={<Printer size={15} strokeWidth={2} aria-hidden />} disabled={shownCount === 0 || waiting} onClick={() => window.print()} data-testid="desk-report-print">
          Печать
        </Button>
      </Tooltip>
    </>
  );

  const search = <SearchField ref={searchField} value={query} onChange={setQuery} placeholder="Найти человека  ·  F" width={240} aria-label="Найти человека" />;

  return (
    <DeskPage>
      <PageTitle
        title="Отчёты"
        actions={
          hydrated && !off ? (
            <Toolbar>
              <SegmentTabs aria-label="Вид отчётов" value={tab} onChange={(next) => address({ tab: next })} items={TABS} />
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
          <Bone h={132} />
          <Bone h={36} w={520} className="mt-3.5" />
          <Bone h={320} className="mt-3.5" />
        </SkeletonGroup>
      ) : (
        <div className="flex flex-col gap-3.5" data-testid="desk-reports">
          {tab === "day" ? (
            <DayView
              filters={
                <Toolbar
                  end={
                    <>
                      <span className="nums reports-count text-[13px] leading-4 text-muted">{day.data ? `${shownDay.length} из ${dayRows.length}` : " "}</span>
                      {handOut}
                    </>
                  }
                >
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
              show={dayShow}
              onShow={setDayShow}
              selectedId={chosenId}
              openId={openId}
              onSelect={choose}
              onOpen={open}
              onClose={() => address({ p: null })}
              pointsOn={pointsEnabled}
              now={now}
            />
          ) : (
            <PeriodView
              filters={
                <Toolbar
                  end={
                    <>
                      <span className="nums reports-count text-[13px] leading-4 text-muted">{period.data ? `${shownPeriod.length} из ${periodRows.length}` : " "}</span>
                      {handOut}
                    </>
                  }
                >
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
      {hydrated && !off && paper ? <PrintSheet company={company.data?.name} title={paper.title} note={shownCount < allCount ? `Показано ${shownCount} из ${allCount}` : null} sheet={paper.sheet} /> : null}
    </DeskPage>
  );
}
