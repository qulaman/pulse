"use client";

import { Download, Printer } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { useDeskParams, writeDeskAddress } from "@/components/desk/DeskAddress";
import { useDeskScope } from "@/components/desk/DeskScope";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { IconButton } from "@/components/desk/ui/IconButton";
import { Menu, type MenuItem } from "@/components/desk/ui/Menu";
import { DeskPage } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { askFromOf } from "@/lib/daily-report/due";
import { useCheckReports, useReportsFeed, useUncheckedReportsCount } from "@/lib/daily-report/review";
import { tabelPeriodWords } from "@/lib/daily-report/tabel";
import type { FeedDay, FeedReport, ReportsFeedFilter } from "@/lib/daily-report/types";
import { nowHm, todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { feedFileName, feedSheet, feedSheetTitle, tabelFileName, tabelSheet, tabelSheetTitle, toCsv } from "@/lib/desk/report-export";
import { asksSheet, currentPeriod, holdsToday, periodRange, readAddress, stepPeriod, writeAddress, type ReportsAddress, type TabelPeriod } from "@/lib/desk/reports-address";
import {
  checkableIds,
  checkedText,
  dayHead,
  dayOfRowKey,
  dayRowKey,
  defaultOpenDays,
  isChecked,
  isDayOpen,
  isMorningLine,
  isSubmitted,
  neighbourDay,
  nextUnchecked,
  shownDays,
} from "@/lib/desk/reports-feed";
import { readSheetOpen, sheetOpenOnServer, subscribeSheet, writeSheetOpen } from "@/lib/desk/reports-sheet";
import { useCompanyCard } from "@/lib/desk/settings-queries";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { shortName, useNamesKey } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";
import { useNow } from "@/lib/useNow";

import { arrowOf, onControl, stepKey, useScreenKeys } from "../team/keys";
import { Diary } from "./Diary";
import { FeedSearch, FilterChip, type SearchablePerson } from "./FeedSearch";
import { FeedBone, FeedView, type FeedJump } from "./FeedView";
import { PrintSheet, saveCsv } from "./PrintSheet";
import { JumpToDay, PeriodControls } from "./ReportsHead";
import { useTabel } from "./tabel-data";
import { TabelBone, TabelView, type TabelShow } from "./TabelView";

/** The feed's rows in the order on screen — ↑ ↓ walk the days' heads and the reports alike, A — the reports. */
const FEED_ROWS = ["desk-feed-day-head", "desk-feed-entry", "desk-feed-folded"].map((id) => `[data-testid="desk-feed"] [data-testid="${id}"]`).join(", ");

/** ← → pressed within this time of each other count as one trip: the next press goes on from the last day reached. */
const TRAVEL_MS = 800;

/** Which days stand open: the ones that opened by themselves so far and what the person chose by hand. */
type Fold = { key: string; opened: readonly Ymd[]; toggled: ReadonlyMap<string, boolean> };

/** What the screen hands out: the reports on screen or the табель of the card's period. */
type PaperKind = "day" | "tabel";

/** A square of the head that opens a short menu under itself — «Скачать для Excel», «Печать». */
function PaperButton({ label, icon, items, testId }: { label: string; icon: ReactNode; items: MenuItem[]; testId: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <span ref={box} className="inline-flex">
        <IconButton label={label} icon={icon} pressed={Boolean(anchor)} disabled={items.every((item) => item === "separator" || item.disabled)} onClick={() => setAnchor(anchor ? null : box.current)} testId={testId} />
      </span>
      <Menu open={Boolean(anchor)} onClose={() => setAnchor(null)} anchor={anchor} items={items} align="end" width={260} label={label} />
    </>
  );
}

/**
 * «Отчёты» on the desk (D-152; D-183; D-198; one page — D-201): the «Табель» card on top — the days
 * of a calendar month (a week, one's own stretch) and how many handed in each one, «Показать людей»
 * opens people × days under them — and under it every report folded by days: the newest day open,
 * the days before it one line each. A person — «Дневник» in the shell's right panel. The feed
 * narrows to one person (through months; the card then shows that person's row), to words (the
 * server finds them, the screen marks them) and to «Не проверены». The director marks a report
 * «Проверено» (the button, A; Shift+A — the whole day, with 5 s «Отменить») and it folds into one
 * line; «Просмотрено» comes by itself from what stayed on screen. Everything is in the address
 * (`?who ?q ?only=new ?day ?p ?month|week|from&to`): «Назад», a reload and a link open the same.
 * ← → — the next day (it opens), T — today, F — the search, ↑ ↓ — the days and the reports, Enter —
 * the diary or the day. «Скачать для Excel» and «Печать» hand out the feed's loaded days or the
 * табель, without points (a minus is not public, D-152).
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
  const live = hydrated && !off && Boolean(companyId);

  /* ---- the feed ---- */
  const filter = useMemo<ReportsFeedFilter>(() => ({ who: address.who, q: address.q, unchecked: address.unchecked }), [address.who, address.q, address.unchecked]);
  const filtered = Boolean(filter.who || filter.q || filter.unchecked);
  const feed = useReportsFeed(filter, companyId, live);
  const uncheckedCount = useUncheckedReportsCount(companyId, hydrated && !off && director);
  const { check } = useCheckReports();
  const days = useMemo(() => shownDays(feed.days ?? [], filtered), [feed.days, filtered]);
  const reportsById = useMemo(() => new Map(days.flatMap((day) => day.reports.map((report) => [report.id, report] as const))), [days]);
  /** The chosen row: a report's id or a day's head. */
  const [picked, setPicked] = useState<string | null>(null);
  const [topDay, setTopDay] = useState<Ymd | null>(null);
  const [jump, setJump] = useState<FeedJump>({ day: null, n: 0, smooth: false, open: true });
  const searchRef = useRef<{ focus: () => void }>(null);
  /** Checked in this visit: the folded line of such a report offers «Отменить». */
  const [recent, setRecent] = useState<ReadonlySet<string>>(() => new Set());

  /* ---- which days stand open (D-201) ---- */
  const filterKey = `${filter.who ?? ""}|${filter.q}|${filter.unchecked}`;
  const morning = useMemo(() => {
    const holidays: readonly string[] = rules?.holidays ?? [];
    const line = days.find((day) => isMorningLine(day, { filtered, holiday: holidays.includes(day.date), beforeAsk: nowHm(now) < askFrom }));
    return (line?.date ?? null) as Ymd | null;
  }, [days, filtered, rules?.holidays, now, askFrom]);
  // while the feed still shows the days of the filter before this one, nothing opens by itself
  const defaults = useMemo(() => (feed.placeholder ? [] : defaultOpenDays(days, morning)), [feed.placeholder, days, morning]);
  const [foldState, setFoldState] = useState<Fold>(() => ({ key: filterKey, opened: [], toggled: new Map() }));
  // a day that opened by itself stays open while one reads — today's first report at 17:05 opens
  // today and does not fold yesterday under the reader; another filter starts anew
  let fold = foldState.key === filterKey ? foldState : { key: filterKey, opened: [], toggled: new Map<string, boolean>() };
  const newlyOpen = defaults.filter((day) => !fold.opened.includes(day));
  if (newlyOpen.length > 0) fold = { ...fold, opened: [...fold.opened, ...newlyOpen] };
  if (fold !== foldState) setFoldState(fold);
  const isOpen = (day: Ymd) => isDayOpen(day, fold.opened, fold.toggled, filtered);
  const toggleDay = (day: Ymd, open: boolean) => setFoldState((was) => (was.toggled.get(day) === open ? was : { ...was, toggled: new Map(was.toggled).set(day, open) }));

  /* ---- the «Табель» card ---- */
  const period: TabelPeriod = address.period ?? currentPeriod("month", today);
  const range = periodRange(period);
  const [tabelShow, setTabelShow] = useState<TabelShow>("team");
  const [tabelPick, setTabelPick] = useState<string | null>(null);
  const tabel = useTabel(range.from, range.to, today, live);
  // folded as it opens; this computer remembers «Показать людей»; an old link to «Табель» opens it for the visit
  const remembered = useSyncExternalStore(subscribeSheet, readSheetOpen, sheetOpenOnServer);
  const asks = asksSheet(new URLSearchParams(params.toString()));
  const [link, setLink] = useState({ asks, open: asks });
  // the page drops `tab` from the address at its first move: the card stays open for the visit, and
  // opens again when «Назад» comes back to such a link
  if (link.asks !== asks) setLink({ asks, open: asks || link.open });
  const sheetOpen = link.open || remembered;
  const foldSheet = (folded: boolean) => {
    setLink({ asks, open: false });
    writeSheetOpen(!folded);
  };

  /**
   * Writes the address without a trip to the server: only what changed. Each move is a step of the
   * browser's history, so «Назад» goes back to the day, the filter or the diary before it; a held
   * key replaces its own step. Through the desk's address (D-184): another person's diary changes
   * in the panel in place.
   */
  const go = (next: Partial<ReportsAddress>, replace = false) => {
    // from the address as it is now, not as drawn: another person may still wait for its transition
    const current = readAddress(new URLSearchParams(window.location.search));
    const merged: ReportsAddress = { ...current, ...next };
    const text = writeAddress(merged);
    const url = text ? `${pathname}?${text}` : pathname;
    if (url === `${pathname}${window.location.search}`) return;
    const picking = next.person !== undefined && next.person !== openId && Boolean(next.person && openId);
    writeDeskAddress(url, { push: !replace, type: picking ? "desk-pick" : undefined, burst: replace });
  };

  // a day the page itself scrolled to is not scrolled to again when the address catches up; a day
  // that came from elsewhere (Back, a link, a filter) is
  const ownDay = useRef<{ key: string } | null>(null);
  const jumpKey = `${address.day ?? ""}|${filterKey}`;
  useEffect(() => {
    if (ownDay.current?.key === jumpKey) return;
    ownDay.current = { key: jumpKey };
    setJump((was) => ({ day: address.day, n: was.n + 1, smooth: false, open: true }));
  }, [jumpKey, address.day]);
  const keyFor = (patch: Partial<ReportsAddress>) => {
    const merged = { ...address, ...patch };
    return `${merged.day ?? ""}|${merged.who ?? ""}|${merged.q}|${merged.unchecked}`;
  };
  /** Scrolls the feed to a day, opens it and writes it into the address in place (no history of every step). */
  const toDay = (day: Ymd | null, at: { smooth?: boolean; push?: boolean; open?: boolean; patch?: Partial<ReportsAddress> } = {}) => {
    const target = day && day >= today ? null : day;
    ownDay.current = { key: keyFor({ day: target }) };
    go({ ...at.patch, day: target }, !at.push);
    setJump((was) => ({ day: target, n: was.n + 1, smooth: at.smooth ?? true, open: at.open ?? true }));
  };
  /** The diary of a person on a day — the feed stays where it is. */
  const openDiary = (userId: string, day: Ymd) => {
    ownDay.current = { key: keyFor({ day }) };
    go({ person: userId, day });
  };
  const openReport = (report: FeedReport) => {
    setPicked(report.id);
    openDiary(report.user_id, report.report_date as Ymd);
  };
  const setFilter = (patch: Partial<Pick<ReportsAddress, "who" | "q" | "unchecked">>) => go({ ...patch, day: null });

  /** «Проверено» on or off; what was just checked keeps «Отменить» on its folded line. */
  const checkNow = (ids: string[], on: boolean) => {
    check(ids, on);
    setRecent((was) => {
      const next = new Set(was);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const checkDay = (day: FeedDay | undefined) => {
    if (!day || !director) return;
    const ids = checkableIds(day.reports);
    if (ids.length === 0) return;
    checkNow(ids, true);
    // the batch is written at once; «Отменить» takes the same ids off (D-139's five seconds)
    toast(`${checkedText(ids.length)} · ${dayHead(day.date as Ymd, today).name.toLowerCase()}`, {
      lifetimeMs: 5000,
      action: { label: "Отменить", onClick: () => checkNow(ids, false) },
    });
  };
  const feedOrder = () => [...document.querySelectorAll<HTMLElement>(FEED_ROWS)].map((row) => row.dataset.rowKey ?? "").filter(Boolean);
  const rowNode = (key: string) => document.querySelector<HTMLElement>(`[data-testid="desk-feed"] [data-row-key="${CSS.escape(key)}"]`);
  /** The day of the chosen row while that row is in sight; null — nothing chosen, or it has scrolled away or folded. */
  const pickedDay = (): Ymd | null => {
    const node = picked ? rowNode(picked) : null;
    const main = document.getElementById("desk-main");
    if (!picked || !node || !main) return null;
    const box = node.getBoundingClientRect();
    const frame = main.getBoundingClientRect();
    if (box.bottom <= frame.top || box.top >= frame.bottom) return null;
    return dayOfRowKey(picked) ?? ((reportsById.get(picked)?.report_date ?? null) as Ymd | null);
  };
  const waits = (id: string) => {
    const report = reportsById.get(id);
    return Boolean(report && isSubmitted(report) && !isChecked(report));
  };
  /** A — «Проверено» on the chosen report on / off; the choice moves on to the next one that waits. */
  const checkPicked = () => {
    const order = feedOrder();
    const report = picked ? reportsById.get(picked) : undefined;
    if (!report) {
      const first = nextUnchecked(order, picked, waits);
      if (first) {
        setPicked(first);
        rowNode(first)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      return;
    }
    const on = !isChecked(report);
    checkNow([report.id], on);
    if (!on) return;
    const next = nextUnchecked(order, report.id, (id) => id !== report.id && waits(id));
    if (next) {
      setPicked(next);
      rowNode(next)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  // ← → pressed one after another go on from the day the last press went to
  const travel = useRef<{ day: Ymd; at: number } | null>(null);
  // a held ← → only travels; the day it stopped at opens when the key is let go
  const held = useRef<Ymd | null>(null);
  useEffect(() => {
    const up = (event: KeyboardEvent) => {
      if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;
      const day = held.current;
      held.current = null;
      if (day) setFoldState((was) => (was.toggled.get(day) === true ? was : { ...was, toggled: new Map(was.toggled).set(day, true) }));
    };
    window.addEventListener("keyup", up);
    return () => window.removeEventListener("keyup", up);
  }, []);

  const stepTabel = (dir: -1 | 1) => {
    if (period.kind === "custom") return;
    const next = stepPeriod(period, dir);
    if (periodRange(next).from > today) return;
    go({ period: next });
  };
  const dayOf = (day: string | null | undefined) => days.find((item) => item.date === day);
  /** T — the top of the feed and the period that holds today. */
  const toToday = () => toDay(null, { patch: { period: period.kind === "week" ? currentPeriod("week", today) : null } });

  useScreenKeys(
    (event) => {
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        const dir = event.code === "ArrowLeft" ? -1 : 1;
        // from the day the key has just gone to (the scroll may still be on its way, and folded days
        // may all fit one screen — then no head ever reaches the top); else from the chosen row's
        // day while it is in sight; else from the day on top
        const stamp = performance.now();
        const from = travel.current && stamp - travel.current.at < TRAVEL_MS ? travel.current.day : (pickedDay() ?? topDay);
        const next = neighbourDay(
          days.map((day) => day.date as Ymd),
          from,
          dir,
        );
        // a held key travels over the folded days; the day one stops at opens (the key's release), and
        // ↑ ↓ go on from its head
        if (next) {
          toDay(next, { smooth: !event.repeat, open: !event.repeat });
          setPicked(dayRowKey(next));
          travel.current = { day: next, at: stamp };
          held.current = event.repeat ? next : null;
        } else if (dir === -1 && feed.hasMore) feed.loadMore();
        return true;
      }
      if (event.code === "KeyT") {
        toToday();
        return true;
      }
      if (event.code === "KeyF") {
        searchRef.current?.focus();
        return true;
      }
      if (event.code === "KeyA" && director) {
        if (event.shiftKey) {
          // the day of the chosen row while it is in sight; otherwise the day on top
          checkDay(dayOf(pickedDay() ?? topDay) ?? days[0]);
        } else checkPicked();
        return true;
      }
      const arrow = arrowOf(event);
      if (arrow) {
        const next = stepKey(feedOrder(), picked, arrow === "down");
        if (!next) return false;
        setPicked(next);
        rowNode(next)?.scrollIntoView({ block: "nearest" });
        // the diary follows the choice while it is open
        const report = reportsById.get(next);
        if (openId && report && report.user_id !== openId) {
          ownDay.current = { key: keyFor({ day: report.report_date as Ymd }) };
          go({ person: report.user_id, day: report.report_date as Ymd }, true);
        }
        return true;
      }
      if ((event.code === "Enter" || event.code === "NumpadEnter" || event.code === "Space") && !onControl(event.target)) {
        const day = dayOfRowKey(picked);
        if (day) {
          toggleDay(day, !isOpen(day));
          return true;
        }
        const report = picked ? reportsById.get(picked) : undefined;
        if (!report) return false;
        if (event.code === "Space" && openId === report.user_id) go({ person: null });
        else openReport(report);
        return true;
      }
      return false;
    },
    hydrated && !off,
  );
  useShortcuts("Отчёты", [
    { keys: ["←", "→"], label: "Предыдущий / следующий день — и раскрыть его" },
    { keys: ["T"], label: "К сегодняшнему дню" },
    { keys: ["↑", "↓"], label: "Выбрать день или отчёт" },
    { keys: ["Enter"], label: "Раскрыть или свернуть день · открыть дневник человека" },
    { keys: ["A"], label: "Проверено / снять отметку — и к следующему" },
    { keys: ["Shift", "A"], label: "Проверить все просмотренные за день" },
    { keys: ["F"], label: "Найти человека или слово" },
    { keys: ["Ctrl P"], label: "Распечатать отчёты ленты" },
  ]);

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
  const tabelPeople = (tabel.data?.people ?? []).filter((person) =>
    filter.who ? person.row.user_id === filter.who : !sheetOpen || tabelShow === "team" || (!person.gone && person.row.missed > 0),
  );
  const feedShown = days.reduce((sum, day) => sum + day.reports.length, 0);
  const narrowedBy = [whoPerson?.full_name, filter.q ? `«${filter.q}»` : "", filter.unchecked ? "не проверенные" : ""].filter(Boolean).join(" · ");
  const feedPaper = feed.days
    ? { kind: "day" as const, file: feedFileName(days), title: feedSheetTitle(days), sheet: feedSheet(days), note: narrowedBy ? `Только: ${narrowedBy}` : null, empty: feedShown === 0 }
    : null;
  const tabelPaper = tabel.data
    ? {
        kind: "tabel" as const,
        file: tabelFileName(tabel.data.from, tabel.data.to),
        title: tabelSheetTitle(tabel.data.from, tabel.data.to),
        sheet: tabelSheet(tabel.data, tabelPeople),
        note: tabelPeople.length < tabel.data.people.length ? `Показано ${tabelPeople.length} из ${tabel.data.people.length}` : null,
        empty: tabelPeople.length === 0 || tabel.isPlaceholderData,
      }
    : null;
  // the sheet in the page for Ctrl+P: the feed's reports until «Печать → Табель» asks for the other
  const [paperKind, setPaperKind] = useState<PaperKind>("day");
  const paper = (paperKind === "tabel" ? tabelPaper : feedPaper) ?? feedPaper ?? tabelPaper;
  const print = (kind: PaperKind) => {
    flushSync(() => setPaperKind(kind));
    // Ctrl+P afterwards is the feed's reports again, as its hint says
    window.addEventListener("afterprint", () => setPaperKind("day"), { once: true });
    window.print();
  };
  const tabelWords = tabel.data ? tabelPeriodWords(tabel.data.from, tabel.data.to) : "";
  const papers = (act: (kind: PaperKind) => void): MenuItem[] => [
    // every day the feed has loaded under its filters, folded or open — the item names the stretch
    { key: "day", label: feedPaper && !feedPaper.empty ? feedPaper.title : "Отчёты", disabled: !feedPaper || feedPaper.empty, onSelect: () => act("day") },
    { key: "tabel", label: tabelWords ? `Табель · ${tabelWords}` : "Табель", disabled: !tabelPaper || tabelPaper.empty, onSelect: () => act("tabel") },
  ];
  const save = (kind: PaperKind) => {
    const one = kind === "tabel" ? tabelPaper : feedPaper;
    if (one) saveCsv(one.file, toCsv(one.sheet));
  };

  const head = (
    <div className="desk-page-title rep-feed-title flex flex-wrap items-center gap-3" data-testid="desk-reports-head">
      <h1 className="mr-1 truncate font-display text-[28px] font-bold leading-[34px] tracking-[-0.025em]">Отчёты</h1>
      {hydrated && !off ? (
        <>
          <span className="flex-1" />
          <div className="flex flex-wrap items-center gap-1.5" data-testid="desk-toolbar">
            <FeedSearch ref={searchRef} people={searchable} onPerson={(id) => setFilter({ who: id })} onWords={(text) => setFilter({ q: text })} />
            <JumpToDay value={topDay ?? today} today={today} now={now} onPick={(day) => toDay(day, { smooth: false, push: true })} />
            <PaperButton label="Скачать для Excel" icon={<Download size={16} strokeWidth={2} aria-hidden />} items={papers(save)} testId="desk-report-csv" />
            <PaperButton label="Распечатать" icon={<Printer size={16} strokeWidth={2} aria-hidden />} items={papers(print)} testId="desk-report-print" />
          </div>
        </>
      ) : null}
    </div>
  );

  const filters = (
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
  );

  const periodControls = (
    <PeriodControls
      period={period}
      onKind={(kind) => go({ period: kind === "custom" ? { kind: "custom", ...range } : currentPeriod(kind, range.to > today ? today : range.to) })}
      onPeriod={(next) => go({ period: next })}
      onStep={stepTabel}
      atToday={holdsToday(period, today)}
      onToday={() => go({ period: currentPeriod(period.kind === "custom" ? "month" : period.kind, today) })}
      today={today}
      now={now}
    />
  );

  // without a day in the address the diary came from a name of the card: it looks at the card's period
  const diaryFocus: Ymd = address.day ?? (range.to > today ? today : range.to);
  const chosenPerson = tabelPick ?? openId;

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
        <div className="flex min-h-0 flex-1 flex-col gap-3.5">
          <TabelBone />
          <SkeletonGroup>
            <Bone h={36} w={236} />
          </SkeletonGroup>
          <div className="rep-day rep-feed">
            <FeedBone />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3.5" data-testid="desk-reports">
          <TabelView
            tabel={tabel.data}
            stale={tabel.isPlaceholderData}
            failed={tabel.isError && !tabel.data}
            onRetry={() => void tabel.refetch()}
            controls={periodControls}
            who={filter.who}
            folded={!sheetOpen}
            onFold={foldSheet}
            show={tabelShow}
            onShow={setTabelShow}
            selectedId={chosenPerson}
            openId={openId}
            onSelect={(id) => {
              setTabelPick(id);
              if (openId && openId !== id) go({ person: id }, true);
            }}
            onOpen={(id) => {
              if (id) setTabelPick(id);
              if (id !== openId) go({ person: id });
            }}
            onCell={(id, day) => {
              setTabelPick(id);
              openDiary(id, day);
            }}
            onDay={(day) => toDay(day, { push: true })}
            today={today}
          />
          {filters}
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
            onLanded={(day) => toggleDay(day, true)}
            isOpen={isOpen}
            onToggle={toggleDay}
            selectedId={picked}
            openId={openId}
            onSelect={setPicked}
            onOpenReport={openReport}
            onOpenPerson={openDiary}
            onCheck={checkNow}
            onCheckDay={checkDay}
            recent={recent}
            onClearFilters={() => setFilter({ who: null, q: "", unchecked: false })}
          />
        </div>
      )}
      {hydrated && !off && openId ? (
        <InPanel panelKey={`diary:${openId}`} onClose={() => go({ person: null })}>
          <Diary
            userId={openId}
            focus={diaryFocus}
            today={today}
            director={director}
            onDay={(next) => go({ day: next >= today ? null : next })}
            onAll={() => go({ person: null, day: null, who: openId, q: "", unchecked: false })}
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
