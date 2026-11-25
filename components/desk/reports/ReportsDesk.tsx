"use client";

import { Download, Printer } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, ViewTransition } from "react";

import { useDeskParams, writeDeskAddress } from "@/components/desk/DeskAddress";
import { useDeskScope } from "@/components/desk/DeskScope";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { IconButton } from "@/components/desk/ui/IconButton";
import { DeskPage } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { SWITCH_OR_STEP } from "@/lib/desk/motion";
import { askFromOf } from "@/lib/daily-report/due";
import { useCheckReports, useReportsFeed, useUncheckedReportsCount } from "@/lib/daily-report/review";
import type { FeedDay, FeedReport, ReportsFeedFilter } from "@/lib/daily-report/types";
import { todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { feedFileName, feedSheet, feedSheetTitle, tabelFileName, tabelSheet, tabelSheetTitle, toCsv } from "@/lib/desk/report-export";
import { currentPeriod, holdsToday, periodRange, readAddress, stepPeriod, writeAddress, type ReportsAddress, type ReportsTab, type TabelPeriod } from "@/lib/desk/reports-address";
import { checkableIds, checkedText, dayHead, isChecked, isSubmitted, neighbourDay, nextUnchecked, shownDays } from "@/lib/desk/reports-feed";
import { useCompanyCard } from "@/lib/desk/settings-queries";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { shortName, useNamesKey } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { personFits } from "@/lib/people/search";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";
import { useNow } from "@/lib/useNow";

import { arrowOf, onControl, stepKey, useScreenKeys } from "../team/keys";
import { Diary } from "./Diary";
import { FeedSearch, FilterChip, type SearchablePerson } from "./FeedSearch";
import { FeedView, type FeedJump } from "./FeedView";
import { PrintSheet, saveCsv } from "./PrintSheet";
import { JumpToDay, PeriodControls } from "./ReportsHead";
import { useTabel } from "./tabel-data";
import { TabelView, type TabelShow } from "./TabelView";

const TABS: { value: ReportsTab; label: string }[] = [
  { value: "feed", label: "Подряд" },
  { value: "tabel", label: "Табель" },
];

/** The reports of the feed in the order on screen — ↑ ↓ and A walk them. */
const FEED_ROWS = '[data-testid="desk-feed"] [data-testid="desk-feed-entry"], [data-testid="desk-feed"] [data-testid="desk-feed-folded"]';
const TABEL_ROWS = '[data-testid="desk-tabel"] [data-row-key]';

/**
 * «Отчёты» on the desk (D-152; D-183; D-198): «Подряд» — every report day after day, today on top,
 * each day under its sticky head, the roll call of the day on top beside it; «Табель» — people ×
 * days of a calendar month, a Monday–Sunday week or one's own stretch. A person — «Дневник» in the
 * shell's right panel, the same on both tabs. The feed narrows to one person (through months), to
 * words (the server finds them, the screen marks them) and to «Не проверены». The director marks
 * a report «Проверено» (the button, A; Shift+A — the day on top, with 5 s «Отменить»); «Просмотрено»
 * comes by itself from what stayed on screen. Everything is in the address (`?who ?q ?only=new
 * ?day ?p`, `?tab=tabel&month|week|from&to`): «Назад», a reload and a link open the same. ← → —
 * the next day, T — today, F — the search, ↑ ↓ — the reports, Enter — the diary. «Скачать для
 * Excel» and «Печать» hand out what is shown, without points (a minus is not public, D-152).
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
  const companyId = me.data?.companyId;
  const director = me.data?.role === "director";
  const people = usePeople();
  const company = useCompanyCard();

  /* ---- «Подряд» ---- */
  const filter = useMemo<ReportsFeedFilter>(() => ({ who: address.who, q: address.q, unchecked: address.unchecked }), [address.who, address.q, address.unchecked]);
  const filtered = Boolean(filter.who || filter.q || filter.unchecked);
  const feed = useReportsFeed(filter, companyId, hydrated && tab === "feed" && !off && Boolean(companyId));
  const uncheckedCount = useUncheckedReportsCount(companyId, hydrated && !off && director);
  const { check } = useCheckReports();
  const days = useMemo(() => shownDays(feed.days ?? [], filtered), [feed.days, filtered]);
  const reportsById = useMemo(() => new Map(days.flatMap((day) => day.reports.map((report) => [report.id, report] as const))), [days]);
  const [picked, setPicked] = useState<string | null>(null);
  const [topDay, setTopDay] = useState<Ymd | null>(null);
  const [jump, setJump] = useState<FeedJump>({ day: null, n: 0, smooth: false });
  const searchRef = useRef<{ focus: () => void }>(null);

  /* ---- «Табель» ---- */
  const period: TabelPeriod = address.period ?? currentPeriod("month", today);
  const range = periodRange(period);
  const [query, setQuery] = useState("");
  const [tabelShow, setTabelShow] = useState<TabelShow>("all");
  const [selected, setSelected] = useState<string | null>(openId);
  const tabelSearch = useRef<HTMLInputElement>(null);
  const tabel = useTabel(range.from, range.to, today, hydrated && tab === "tabel" && Boolean(companyId) && !off);
  const match = (row: { full_name: string; position: string | null }) => personFits(row, query);

  /**
   * Writes the address without a trip to the server: only what changed. Each move is a step of the
   * browser's history, so «Назад» goes back to the day, the filter or the diary before it; a held
   * key replaces its own step. Through the desk's address (D-184): «Подряд» ↔ «Табель» swap as two
   * pictures, another person's diary changes in the panel in place.
   */
  const go = (next: Partial<ReportsAddress>, replace = false) => {
    // from the address as it is now, not as drawn: another person may still wait for its transition
    const current = readAddress(new URLSearchParams(window.location.search));
    const merged: ReportsAddress = { ...current, ...next };
    const text = writeAddress(merged);
    const url = text ? `${pathname}?${text}` : pathname;
    if (url === `${pathname}${window.location.search}`) return;
    const switched = next.tab !== undefined && next.tab !== tab;
    const picking = !switched && next.person !== undefined && next.person !== openId && Boolean(next.person && openId);
    writeDeskAddress(url, { push: !replace, type: switched ? "desk-switch" : picking ? "desk-pick" : undefined, burst: replace });
  };

  // a day the page itself scrolled to is not scrolled to again when the address catches up; a day
  // that came from elsewhere (Back, a link, a filter) is
  const ownDay = useRef<{ key: string } | null>(null);
  const jumpKey = `${tab}|${address.day ?? ""}|${filter.who ?? ""}|${filter.q}|${filter.unchecked}`;
  useEffect(() => {
    if (tab !== "feed" || ownDay.current?.key === jumpKey) return;
    ownDay.current = { key: jumpKey };
    setJump((was) => ({ day: address.day, n: was.n + 1, smooth: false }));
  }, [tab, jumpKey, address.day]);
  const keyFor = (patch: Partial<ReportsAddress>) => {
    const merged = { ...address, ...patch };
    return `${merged.tab}|${merged.day ?? ""}|${merged.who ?? ""}|${merged.q}|${merged.unchecked}`;
  };
  /** Scrolls the feed to a day and writes it into the address in place (no history of every step). */
  const toDay = (day: Ymd | null, smooth = true, push = false) => {
    const target = day && day >= today ? null : day;
    ownDay.current = { key: keyFor({ day: target }) };
    go({ day: target }, !push);
    setJump((was) => ({ day: target, n: was.n + 1, smooth }));
  };
  /** The diary of a person on a day — the feed stays where it is. */
  const openDiary = (userId: string, day: Ymd) => {
    ownDay.current = { key: keyFor({ day }) };
    go({ person: userId, day });
  };
  const openReport = (report: FeedReport) => {
    setPicked(report.id);
    openDiary(report.user_id, report.report_date);
  };
  const setFilter = (patch: Partial<Pick<ReportsAddress, "who" | "q" | "unchecked">>) => go({ ...patch, day: null });

  const checkDay = (day: FeedDay | undefined) => {
    if (!day || !director) return;
    const ids = checkableIds(day.reports);
    if (ids.length === 0) return;
    check(ids, true);
    // the batch is written at once; «Отменить» takes the same ids off (D-139's five seconds)
    toast(`${checkedText(ids.length)} · ${dayHead(day.date, today).name.toLowerCase()}`, {
      lifetimeMs: 5000,
      action: { label: "Отменить", onClick: () => check(ids, false) },
    });
  };
  const feedOrder = () => [...document.querySelectorAll<HTMLElement>(FEED_ROWS)].map((row) => row.dataset.rowKey ?? "").filter(Boolean);
  const waits = (id: string) => {
    const report = reportsById.get(id);
    return Boolean(report && isSubmitted(report) && !isChecked(report));
  };
  /** A — «Проверено» on the chosen report on / off; the choice moves on to the next one that waits. */
  const checkPicked = () => {
    const order = feedOrder();
    const report = picked ? reportsById.get(picked) : undefined;
    if (!report) {
      const first = nextUnchecked(order, null, waits);
      if (first) setPicked(first);
      return;
    }
    const on = !isChecked(report);
    check([report.id], on);
    if (!on) return;
    const next = nextUnchecked(order, report.id, (id) => id !== report.id && waits(id));
    if (next) {
      setPicked(next);
      document.querySelector<HTMLElement>(`[data-testid="desk-feed-entry"][data-row-key="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  const stepTabel = (dir: -1 | 1, replace = false) => {
    if (period.kind === "custom") return;
    const next = stepPeriod(period, dir);
    if (periodRange(next).from > today) return;
    go({ period: next }, replace);
  };
  const tabelToday = () => go({ period: currentPeriod(period.kind === "custom" ? "month" : period.kind, today) });
  const dayOf = (day: Ymd | null) => days.find((item) => item.date === day);

  const chosenPerson = selected ?? openId;
  useScreenKeys(
    (event) => {
      const feedTab = tab === "feed";
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        const dir = event.code === "ArrowLeft" ? -1 : 1;
        if (!feedTab) {
          stepTabel(dir, event.repeat);
          return true;
        }
        const next = neighbourDay(
          days.map((day) => day.date),
          topDay,
          dir,
        );
        if (next) toDay(next, !event.repeat);
        else if (dir === -1 && feed.hasMore) feed.loadMore();
        return true;
      }
      if (event.code === "KeyT") {
        if (feedTab) toDay(null);
        else tabelToday();
        return true;
      }
      if (event.code === "KeyF") {
        if (feedTab) searchRef.current?.focus();
        else tabelSearch.current?.focus();
        return true;
      }
      if (feedTab && event.code === "KeyA" && director) {
        if (event.shiftKey) checkDay(dayOf(topDay) ?? days[0]);
        else checkPicked();
        return true;
      }
      const arrow = arrowOf(event);
      if (arrow) {
        if (feedTab) {
          const next = stepKey(feedOrder(), picked, arrow === "down");
          if (!next) return false;
          setPicked(next);
          document.querySelector<HTMLElement>(`[data-testid="desk-feed"] [data-row-key="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
          // the diary follows the choice while it is open
          const report = reportsById.get(next);
          if (openId && report && report.user_id !== openId) {
            ownDay.current = { key: keyFor({ day: report.report_date }) };
            go({ person: report.user_id, day: report.report_date }, true);
          }
          return true;
        }
        const keys = [...new Set([...document.querySelectorAll<HTMLElement>(TABEL_ROWS)].map((row) => row.dataset.rowKey ?? ""))].filter(Boolean);
        const next = stepKey(keys, chosenPerson, arrow === "down");
        if (next) {
          setSelected(next);
          if (openId && openId !== next) go({ person: next }, true);
        }
        return Boolean(next);
      }
      if ((event.code === "Enter" || event.code === "NumpadEnter" || event.code === "Space") && !onControl(event.target)) {
        if (feedTab) {
          const report = picked ? reportsById.get(picked) : undefined;
          if (!report) return false;
          if (event.code === "Space" && openId === report.user_id) go({ person: null });
          else openReport(report);
          return true;
        }
        if (!chosenPerson) return false;
        go({ person: event.code === "Space" && openId === chosenPerson ? null : chosenPerson });
        return true;
      }
      return false;
    },
    hydrated && !off,
  );
  useShortcuts(
    "Отчёты",
    tab === "feed"
      ? [
          { keys: ["←", "→"], label: "Предыдущий / следующий день" },
          { keys: ["T"], label: "К сегодняшнему дню" },
          { keys: ["↑", "↓"], label: "Выбрать отчёт" },
          { keys: ["A"], label: "Проверено / снять отметку — и к следующему" },
          { keys: ["Shift", "A"], label: "Проверить все просмотренные за день наверху" },
          { keys: ["Enter"], label: "Открыть дневник человека" },
          { keys: ["F"], label: "Найти человека или слово" },
          { keys: ["Ctrl P"], label: "Распечатать то, что на экране" },
        ]
      : [
          { keys: ["←", "→"], label: "Предыдущий / следующий период" },
          { keys: ["T"], label: "К периоду с сегодняшним днём" },
          { keys: ["↑", "↓"], label: "Выбрать человека" },
          { keys: ["Enter"], label: "Открыть дневник человека" },
          { keys: ["F"], label: "Найти человека" },
          { keys: ["Ctrl P"], label: "Распечатать то, что на экране" },
        ],
  );

  /* ---- who is who ---- */
  const searchable: SearchablePerson[] = useMemo(
    () =>
      (people.data ?? [])
        .filter((person) => person.role !== "tv")
        .map((person) => ({ id: person.id, full_name: person.full_name, position: person.position, avatar_url: person.avatar_url, aliases: person.aliases, gone: !person.is_active })),
    [people.data],
  );
  const whoPerson = filter.who ? (searchable.find((person) => person.id === filter.who) ?? reportPerson(days, filter.who)) : null;
  const checkerName = (id: string | null | undefined) => {
    if (!id || id === me.data?.userId) return null;
    const person = searchable.find((row) => row.id === id);
    return person ? shortName(person.full_name) : null;
  };

  /* ---- what the screen hands out ---- */
  const tabelPeople = (tabel.data?.people ?? []).filter((person) => match(person.row) && (tabelShow === "all" || (!person.gone && person.row.missed > 0)));
  const feedShown = days.reduce((sum, day) => sum + day.reports.length, 0);
  const narrowedBy = [whoPerson?.full_name, filter.q ? `«${filter.q}»` : "", filter.unchecked ? "не проверенные" : ""].filter(Boolean).join(" · ");
  const paper =
    tab === "feed"
      ? feed.days && { kind: "day" as const, file: feedFileName(days), title: feedSheetTitle(days), sheet: feedSheet(days), note: narrowedBy ? `Только: ${narrowedBy}` : null, empty: feedShown === 0 }
      : tabel.data && {
          kind: "tabel" as const,
          file: tabelFileName(tabel.data.from, tabel.data.to),
          title: tabelSheetTitle(tabel.data.from, tabel.data.to),
          sheet: tabelSheet(tabel.data, tabelPeople),
          note: tabelPeople.length < tabel.data.people.length ? `Показано ${tabelPeople.length} из ${tabel.data.people.length}` : null,
          empty: tabelPeople.length === 0 || tabel.isPlaceholderData,
        };
  const empty = !paper || paper.empty;

  const head = (
    <div className="desk-page-title rep-feed-title flex flex-wrap items-center gap-3" data-testid="desk-reports-head">
      <h1 className="mr-1 truncate font-display text-[28px] font-bold leading-[34px] tracking-[-0.025em]">Отчёты</h1>
      {hydrated && !off ? (
        <>
          <SegmentTabs aria-label="Вид отчётов" value={tab} onChange={(next) => go({ tab: next })} items={TABS} />
          <span className="flex-1" />
          <div className="flex flex-wrap items-center gap-1.5" data-testid="desk-toolbar">
            {tab === "feed" ? (
              <>
                <FeedSearch ref={searchRef} people={searchable} onPerson={(id) => setFilter({ who: id })} onWords={(text) => setFilter({ q: text })} />
                <JumpToDay value={topDay ?? today} today={today} now={now} onPick={(day) => toDay(day, false, true)} />
              </>
            ) : (
              <SearchField ref={tabelSearch} value={query} onChange={setQuery} placeholder="Найти человека  ·  F" width={220} aria-label="Найти человека" />
            )}
            <IconButton
              label={tab === "feed" ? "Скачать для Excel — отчёты на экране" : "Скачать для Excel — табель"}
              icon={<Download size={16} strokeWidth={2} aria-hidden />}
              disabled={empty}
              onClick={() => paper && saveCsv(paper.file, toCsv(paper.sheet))}
              testId="desk-report-csv"
            />
            <IconButton label="Распечатать то, что на экране" keys={["Ctrl P"]} icon={<Printer size={16} strokeWidth={2} aria-hidden />} disabled={empty} onClick={() => window.print()} testId="desk-report-print" />
          </div>
        </>
      ) : null}
    </div>
  );

  const controls =
    tab === "feed" ? (
      <div className="rep-feed-filters" data-testid="desk-feed-filters">
        {director ? (
          <SegmentTabs
            aria-label="Какие отчёты"
            value={filter.unchecked ? "new" : "all"}
            onChange={(next) => setFilter({ unchecked: next === "new" })}
            items={[
              { value: "all", label: "Все" },
              {
                value: "new",
                label: (
                  <>
                    Не проверены{uncheckedCount ? <span className="nums rep-feed-seg-count" data-testid="desk-feed-unchecked-count">{uncheckedCount}</span> : null}
                  </>
                ),
              },
            ]}
          />
        ) : null}
        {filter.who ? <FilterChip face={whoPerson} label={whoPerson?.full_name ?? "Один человек"} onClear={() => setFilter({ who: null })} testId="desk-feed-who" /> : null}
        {filter.q ? <FilterChip label={`«${filter.q}»`} onClear={() => setFilter({ q: "" })} testId="desk-feed-q" /> : null}
      </div>
    ) : (
      <div className="rep-feed-filters">
        <PeriodControls
          period={period}
          onKind={(kind) => go({ period: kind === "custom" ? { kind: "custom", ...range } : currentPeriod(kind, range.to > today ? today : range.to) })}
          onPeriod={(next) => go({ period: next })}
          onStep={stepTabel}
          atToday={holdsToday(period, today)}
          onToday={tabelToday}
          today={today}
          now={now}
        />
      </div>
    );

  const diaryFocus: Ymd = address.day ?? (tab === "feed" ? today : range.to > today ? today : range.to);

  return (
    <DeskPage>
      {head}
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
          <Bone h={32} w={300} />
          <Bone h={120} className="mt-3.5" />
          <Bone h={120} className="mt-3.5" />
        </SkeletonGroup>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3.5" data-testid="desk-reports">
          {controls}
          {/* «Подряд» and «Табель» swap as two pictures (D-184) */}
          <ViewTransition update={SWITCH_OR_STEP} default="none">
            {tab === "feed" ? (
              <FeedView
                feed={feed}
                filter={filter}
                companyId={companyId}
                director={director}
                checkerName={checkerName}
                now={now}
                today={today}
                askFrom={askFrom}
                pointsOn={pointsEnabled}
                jump={jump}
                onTopDay={setTopDay}
                selectedId={picked}
                openId={openId}
                onSelect={setPicked}
                onOpenReport={openReport}
                onOpenPerson={openDiary}
                onCheck={check}
                onCheckDay={checkDay}
                onClearFilters={() => setFilter({ who: null, q: "", unchecked: false })}
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
                selectedId={chosenPerson}
                openId={openId}
                onSelect={(id) => {
                  setSelected(id);
                  if (openId && openId !== id) go({ person: id }, true);
                }}
                onOpen={(id) => {
                  if (id) setSelected(id);
                  if (id !== openId) go({ person: id });
                }}
                onCell={(id, day) => {
                  setSelected(id);
                  go({ person: id, day });
                }}
                onDay={(next) => go({ tab: "feed", day: next >= today ? null : next })}
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
            focus={diaryFocus}
            today={today}
            director={director}
            onDay={(next) => go({ tab: "feed", day: next >= today ? null : next })}
            onAll={() => go({ tab: "feed", person: null, day: null, who: openId, q: "", unchecked: false })}
          />
        </InPanel>
      ) : null}
      {hydrated && !off && paper ? <PrintSheet company={company.data?.name} title={paper.title} note={paper.note} sheet={paper.sheet} kind={paper.kind} /> : null}
    </DeskPage>
  );
}

/** A person known only from the feed (left the team): their name and face from their report. */
function reportPerson(days: readonly FeedDay[], id: string): SearchablePerson | null {
  for (const day of days) {
    const report = day.reports.find((row) => row.user_id === id);
    if (report) return { id, full_name: report.full_name, position: report.position, avatar_url: report.avatar_url, gone: report.gone };
  }
  return null;
}
