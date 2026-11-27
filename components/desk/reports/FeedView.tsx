"use client";

import { Check, CheckCheck, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { shortHm } from "@/lib/daily-report/format";
import { useTeamDailyReportDay } from "@/lib/daily-report/queries";
import type { ReportsFeed } from "@/lib/daily-report/review";
import type { FeedDay, FeedReport, ReportsFeedFilter } from "@/lib/daily-report/types";
import { nowHm, type Ymd } from "@/lib/datetime/calendar";
import { allChecked, checkableIds, dayCountLine, dayHead, dayRowKey, isMorningLine, landingDay, shownDays, waitingCount, waitingText } from "@/lib/desk/reports-feed";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { shortName } from "@/lib/people/names";

import { LedgerEntry } from "./Ledger";
import { RollCall } from "./RollCall";

/** A day's section counts as «on top» once its top has passed this far under the scroller's top (its head is stuck). */
const ON_TOP_PX = 48;
/** The next page is asked for while the end of the feed is this close under the window. */
const PULL_PX = 400;

/** The desk's only scroller (DeskShell). */
const scroller = () => document.getElementById("desk-main");

/** Scrolls the desk so the day's head stands at the top; today (the first) — to the very top, with the page's head. */
function scrollToDay(day: Ymd | null, first: Ymd | null, smooth: boolean): boolean {
  const root = scroller();
  if (!root) return false;
  const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
  if (!day || day === first) {
    root.scrollTo({ top: 0, behavior });
    return true;
  }
  const node = root.querySelector<HTMLElement>(`[data-feed-day="${day}"]`);
  if (!node) return false;
  const top = node.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
  // a near day glides, a far one is there at once (a glide over a month is a wait)
  const far = Math.abs(top - root.scrollTop) > root.clientHeight * 2;
  root.scrollTo({ top: top + 1, behavior: smooth && !far ? "smooth" : "auto" });
  return true;
}

/**
 * A request to bring a day to the top: each one once (`n`); `day` null — today, the top. `open` —
 * the day it lands on opens (a held ← → only travels over the folded days).
 */
export type FeedJump = { day: Ymd | null; n: number; smooth: boolean; open: boolean };

export type FeedViewProps = {
  feed: ReportsFeed;
  filter: ReportsFeedFilter;
  companyId: string | undefined;
  director: boolean;
  /** Names of the company's directors by id, for «Проверено · Аян» when it was not me. */
  checkerName: (id: string | null | undefined) => string | null;
  now: Date;
  today: Ymd;
  askFrom: string;
  pointsOn: boolean;
  jump: FeedJump;
  /** The day whose head is on top now — ← → and the calendar start from it. */
  onTopDay: (day: Ymd) => void;
  /** A jump landed on this day (the one asked, or the first older one listed). */
  onLanded: (day: Ymd) => void;
  /** Whether a day stands open with its reports or folded into its one line (D-201). */
  isOpen: (day: Ymd) => boolean;
  onToggle: (day: Ymd, open: boolean) => void;
  /** The chosen row: a report's id or a day's head (`dayRowKey`). */
  selectedId: string | null;
  /** The person whose diary is open. */
  openId: string | null;
  onSelect: (reportId: string) => void;
  onOpenReport: (report: FeedReport) => void;
  onOpenPerson: (userId: string, day: Ymd) => void;
  onCheck: (ids: string[], on: boolean) => void;
  onCheckDay: (day: FeedDay) => void;
  /** Reports checked in this visit: their folded line offers «Отменить». */
  recent: ReadonlySet<string>;
  onClearFilters: () => void;
};

/** The feed while it loads: the open day's head and its first reports, then the folded days' lines (D-122). */
export function FeedBone() {
  const entry = (key: number) => (
    <div key={key} className="rep-day-bone-entry rep-feed-bone-entry">
      <span className="flex items-start gap-3">
        <Bone round w={32} h={32} />
        <span className="flex flex-1 flex-col gap-1.5 pt-0.5">
          <Bone h={14} w="70%" />
          <Bone h={11} w="45%" />
        </span>
      </span>
      <span className="flex flex-col gap-2 pt-0.5">
        <Bone h={15} w="92%" />
        <Bone h={15} w="64%" />
      </span>
      <span className="flex flex-col items-end gap-2">
        <Bone h={12} w={36} />
        <Bone h={28} w={104} />
      </span>
    </div>
  );
  return (
    <SkeletonGroup grow className="rep-feed-list rep-day-bone">
      <div className="rep-feed-head">
        <Bone h={14} w={220} />
      </div>
      {[0, 1].map(entry)}
      {[0, 1, 2].map((key) => (
        <div key={key} className="rep-feed-head rep-feed-bone-day">
          <Bone h={14} w={180} />
          <span className="flex-1" />
          <Bone h={12} w={150} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** «без отчёта: Нурсултан, Асель (уваж.)» — each name opens the person's diary on that day (the excuse lives there). */
function MissedLine({ day, onOpenPerson }: { day: FeedDay; onOpenPerson: (userId: string, day: Ymd) => void }) {
  if (day.missed_people.length === 0) return null;
  const title = day.missed_people.map((person) => `${person.full_name}${person.excused ? " — уважительная" : ""}`).join(", ");
  return (
    <span className="rep-feed-missed" title={`Без отчёта: ${title}`} data-testid="desk-feed-missed">
      {" · без отчёта: "}
      {day.missed_people.map((person, index) => (
        <Fragment key={person.user_id}>
          {index > 0 ? ", " : ""}
          <button type="button" className="rep-feed-missed-name desk-focus" data-excused={person.excused ? "" : undefined} onClick={() => onOpenPerson(person.user_id, day.date)}>
            {shortName(person.full_name)}
            {person.excused ? <span className="rep-feed-missed-excused"> (уваж.)</span> : null}
          </button>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * A day's head (D-198, D-201): «▸ Вчера · среда, 25 ноября», the team's count and who is without a
 * report, and what is left to the director — folded «5 не проверены», open «Проверить все · N»,
 * either way «все проверены». A press anywhere on it (but its own buttons) folds or opens the day;
 * open, it stays on top while the day's reports are read.
 */
function DayHead({
  day,
  today,
  holiday,
  director,
  open,
  selected,
  rolled,
  onToggle,
  onCheckDay,
  onOpenPerson,
}: {
  day: FeedDay;
  today: Ymd;
  holiday: boolean;
  director: boolean;
  open: boolean;
  selected: boolean;
  /** The day's roll call stands right under the head and says the count itself. */
  rolled: boolean;
  onToggle: (open: boolean) => void;
  onCheckDay: (day: FeedDay) => void;
  onOpenPerson: (userId: string, day: Ymd) => void;
}) {
  const head = dayHead(day.date, today);
  const ready = checkableIds(day.reports);
  const done = allChecked(day.reports);
  const waits = director ? waitingCount(day.reports) : 0;
  return (
    <header
      className="rep-feed-head"
      data-testid="desk-feed-day-head"
      data-row-key={dayRowKey(day.date)}
      data-selected={selected ? "" : undefined}
      onClick={(event) => {
        // a press on a name, «Проверить все» or the fold button itself is theirs
        if ((event.target as HTMLElement).closest("button, a")) return;
        onToggle(!open);
      }}
    >
      <h2 className="rep-feed-head-title">
        <button type="button" className="rep-feed-fold desk-focus" aria-expanded={open} aria-controls={`rep-feed-day-${day.date}`} onClick={() => onToggle(!open)} data-testid="desk-feed-fold">
          <ChevronRight size={16} className="rep-feed-fold-chevron" aria-hidden />
          <span className="rep-feed-head-name">{head.name}</span>
          <span className="rep-feed-head-date">{head.date}</span>
        </button>
      </h2>
      <span className="rep-feed-head-gap" aria-hidden />
      {rolled ? null : (
        <span className="rep-feed-head-sub nums">
          {dayCountLine(day, holiday)}
          <MissedLine day={day} onOpenPerson={onOpenPerson} />
        </span>
      )}
      {director && open && ready.length > 0 ? (
        <Tooltip label="Отметить проверенными все просмотренные отчёты дня" keys={["Shift", "A"]}>
          <button type="button" className="rep-feed-all desk-focus" onClick={() => onCheckDay(day)} data-testid="desk-feed-check-day">
            <CheckCheck size={16} aria-hidden />
            Проверить все · <span className="nums">{ready.length}</span>
          </button>
        </Tooltip>
      ) : director && done ? (
        <span className="rep-feed-head-ok" data-testid="desk-feed-day-done">
          <Check size={14} aria-hidden />
          все проверены
        </span>
      ) : !open && waits > 0 ? (
        <span className="rep-feed-head-waits nums" data-testid="desk-feed-day-waits">
          {waitingText(waits)}
        </span>
      ) : null}
    </header>
  );
}

/**
 * Today's roll call inside its day (D-201; the rail beside the feed before it): «4 из 20 сдали ·
 * ждём 16», the thin bar and «Напомнить всем» on one line; a press opens who we wait for — with
 * «Напомнить» each and the receipt of the push (principle 8) — who missed and who is away.
 */
function DayRoll({
  date,
  companyId,
  now,
  pointsOn,
  openId,
  onOpenPerson,
  onReady,
}: {
  date: Ymd;
  companyId: string | undefined;
  now: Date;
  pointsOn: boolean;
  openId: string | null;
  onOpenPerson: (userId: string, day: Ymd) => void;
  /** The roll call stands on screen (or left it): the day's head leaves the count to it only then. */
  onReady: (ready: boolean) => void;
}) {
  const settings = useCompanySettings();
  const rules = settings.data?.daily_report;
  const team = useTeamDailyReportDay(date, companyId, Boolean(companyId));
  const [expanded, setExpanded] = useState(false);
  const day = team.data;
  const ready = Boolean(day);
  useEffect(() => {
    onReady(ready);
    return () => onReady(false);
  }, [ready, onReady]);
  if (!day) {
    // the read failed: the head above keeps the count, nothing stands here
    if (team.isError) return null;
    return (
      <SkeletonGroup className="rep-feed-roll rep-feed-roll-bone">
        <Bone h={14} w={240} />
      </SkeletonGroup>
    );
  }
  const closedThrough = rules?.checked_on ?? null;
  return (
    <div className="rep-feed-roll">
      <RollCall
        day={day}
        rows={day.rows}
        expanded={expanded}
        onExpand={setExpanded}
        live={day.today || closedThrough === null || day.date > closedThrough}
        offWord={day.workday ? null : (rules?.holidays ?? []).includes(day.date) ? "праздник" : "выходной"}
        pointsOn={pointsOn}
        now={now}
        selectedId={openId}
        openId={openId}
        onSelect={(userId) => onOpenPerson(userId, day.date as Ymd)}
        onOpen={(userId) => onOpenPerson(userId, day.date as Ymd)}
      />
    </div>
  );
}

/**
 * The feed of «Отчёты» on the desk (D-198; folded by days — D-201): the days one under another,
 * today on top, each under its own head «Вт, 24 ноября · сдали 9 из 10 · без отчёта: …». The
 * newest day stands open with its reports in full (the words, the day's tasks, when it came); the
 * days before it are one line each — a month fits a screen, and «5 не проверены» says where work is
 * left. A press on a head opens or folds its day; a checked report folds into one line. Today's
 * roll call with «Напомнить» is inside today. Older days come a week at a time as one scrolls
 * (`useReportsFeed`); the end says «Раньше отчётов нет». Before `ask_from` today is one short line
 * and yesterday is right under it. A jump (the calendar, ← →, a day of the «Табель», a link with
 * `?day`) loads as far as it needs and opens the day it lands on. Under a filter every day is open.
 */
export function FeedView({
  feed,
  filter,
  companyId,
  director,
  checkerName,
  now,
  today,
  askFrom,
  pointsOn,
  jump,
  onTopDay,
  onLanded,
  isOpen,
  onToggle,
  selectedId,
  openId,
  onSelect,
  onOpenReport,
  onOpenPerson,
  onCheck,
  onCheckDay,
  recent,
  onClearFilters,
}: FeedViewProps) {
  const settings = useCompanySettings();
  const rules = settings.data?.daily_report;
  const holidays: readonly string[] = rules?.holidays ?? [];
  const filtered = Boolean(filter.who || filter.q || filter.unchecked);
  // today's roll call has come and stands under today's head
  const [rollReady, setRollReady] = useState(false);

  // under a filter a day without a report of it is not drawn; today stays as the morning's line
  const days = shownDays(feed.days ?? [], filtered);
  const dates = days.map((day) => day.date);
  const first = dates[0] ?? null;

  // the day on top: measured on scroll (one frame at a time), the keys and the calendar follow it
  const latest = useRef({ feed, onTopDay, onLanded, first });
  useLayoutEffect(() => {
    latest.current = { feed, onTopDay, onLanded, first };
  });
  const tail = useRef<HTMLDivElement>(null);
  const datesKey = dates.join(",");
  useEffect(() => {
    const main = scroller();
    if (!main) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rootTop = main.getBoundingClientRect().top;
      let top: Ymd | null = latest.current.first;
      for (const node of main.querySelectorAll<HTMLElement>("[data-feed-day]")) {
        if (node.getBoundingClientRect().top - rootTop <= ON_TOP_PX) top = node.dataset.feedDay as Ymd;
        else break;
      }
      if (top) latest.current.onTopDay(top);
      // the end of the feed comes near: the week before it is asked for
      const end = tail.current;
      const { feed: current } = latest.current;
      if (end && current.hasMore && !current.loadingMore && end.getBoundingClientRect().top - main.getBoundingClientRect().bottom < PULL_PX) current.loadMore();
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // a page that came may still leave the end in view: measure once more after it lands
    onScroll();
    return () => {
      main.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [datesKey, feed.hasMore, feed.loadingMore]);

  // a jump: once per request, as soon as its day (or the first older one listed) is on the page
  const answered = useRef(-1);
  useEffect(() => {
    if (!feed.days || answered.current === jump.n) return;
    const target = jump.day;
    if (!target || (first && target >= first)) {
      answered.current = jump.n;
      // today folded by hand opens again when one comes back to it
      if (jump.open && first) latest.current.onLanded(first);
      requestAnimationFrame(() => scrollToDay(null, first, jump.smooth));
      return;
    }
    const land = landingDay(dates, target);
    if (land) {
      answered.current = jump.n;
      if (jump.open) latest.current.onLanded(land);
      requestAnimationFrame(() => scrollToDay(land, first, jump.smooth));
      return;
    }
    if (feed.hasMore) {
      if (!feed.loadingMore) feed.loadMore();
      return;
    }
    // nothing as old as asked: the oldest there is
    answered.current = jump.n;
    const last = dates[dates.length - 1] ?? null;
    if (last && jump.open) latest.current.onLanded(last);
    requestAnimationFrame(() => scrollToDay(last, first, false));
    // `dates` is in `datesKey`; `feed` changes identity every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, datesKey, feed.days, feed.hasMore, feed.loadingMore]);

  if (!feed.days) {
    return (
      <div className="rep-day rep-feed" data-testid="desk-feed" aria-busy={!feed.error || undefined}>
        {feed.error ? (
          <EmptyState
            title="Не получилось загрузить"
            hint="Отчёты не пришли — проверьте связь и попробуйте ещё раз"
            action={
              <Button size="sm" variant="secondary" onClick={feed.retry}>
                Повторить
              </Button>
            }
          />
        ) : (
          <FeedBone />
        )}
      </div>
    );
  }

  const hasReports = days.some((day) => day.reports.length > 0);
  const empty = filtered && !hasReports && !feed.hasMore;
  // a checked report folds while the director works through a day; a search and one person's history read in full
  const fold = director && !filter.q && !filter.who;

  return (
    <div className="rep-day rep-feed" data-testid="desk-feed">
      <section className="rep-feed-list" aria-label="Отчёты по дням" data-testid="desk-feed-list">
        {empty ? (
          <div className="rep-day-ledger-empty" data-testid="desk-feed-empty">
            <p className="rep-day-ledger-empty-title">{filter.unchecked && !filter.q && !filter.who ? "Непроверенных отчётов нет" : "Ничего не нашлось"}</p>
            <p className="rep-day-ledger-empty-hint">
              {filter.q ? "Слово ищется в словах отчёта и в названиях задач дня" : filter.who ? "У этого человека отчётов нет" : "Все сданные отчёты проверены"}
            </p>
            <button type="button" className="rep-day-more desk-focus mt-2" onClick={onClearFilters}>
              Показать все отчёты
            </button>
          </div>
        ) : null}
        {days.map((day) => {
          const date = day.date as Ymd;
          const holiday = holidays.includes(day.date);
          if (isMorningLine(day, { filtered, holiday, beforeAsk: nowHm(now) < askFrom })) {
            return (
              <p key={day.date} className="rep-feed-morning" data-feed-day={day.date} data-testid="desk-feed-morning">
                <span className="rep-feed-morning-dot" aria-hidden />
                {holiday ? "Сегодня праздник" : !day.workday ? "Сегодня выходной" : `Отчёты за сегодня — с ${shortHm(askFrom)}`}
              </p>
            );
          }
          const open = isOpen(date);
          // today's roll call says the count, who is waited for and «Напомнить» — once it stands
          // there, the head leaves the count to it
          const rolled = open && day.today && day.due > 0 && !filtered;
          return (
            <section key={day.date} className="rep-feed-day" data-feed-day={day.date} data-open={open ? "" : undefined} data-testid="desk-feed-day" aria-label={dayHead(date, today).name}>
              <DayHead
                day={day}
                today={today}
                holiday={holiday}
                director={director}
                open={open}
                selected={selectedId === dayRowKey(day.date)}
                rolled={rolled && rollReady}
                onToggle={(next) => onToggle(date, next)}
                onCheckDay={onCheckDay}
                onOpenPerson={onOpenPerson}
              />
              {open ? (
                <div id={`rep-feed-day-${day.date}`} className="rep-feed-body">
                  {rolled ? <DayRoll date={date} companyId={companyId} now={now} pointsOn={pointsOn} openId={openId} onOpenPerson={onOpenPerson} onReady={setRollReady} /> : null}
                  {day.reports.length === 0 ? (
                    <p className="rep-feed-none">{day.today ? "Пока ни одного отчёта" : "Отчётов нет"}</p>
                  ) : (
                    <ol className="rep-day-entries rep-feed-entries">
                      {day.reports.map((report) => (
                        <LedgerEntry
                          key={report.id}
                          report={report}
                          now={now}
                          query={filter.q}
                          director={director}
                          selected={selectedId === report.id}
                          opened={openId === report.user_id}
                          fold={fold}
                          undo={filter.unchecked || recent.has(report.id)}
                          checker={report.checked_by ? checkerName(report.checked_by) : null}
                          onSelect={onSelect}
                          onOpen={onOpenReport}
                          onCheck={onCheck}
                        />
                      ))}
                    </ol>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}
        <div ref={tail} className="rep-feed-end" data-testid="desk-feed-end">
          {feed.hasMore ? (
            <SkeletonGroup className="flex flex-col gap-2 px-3.5 py-3">
              <Bone h={14} w={180} />
              <Bone h={14} w="60%" />
            </SkeletonGroup>
          ) : days.length > 0 && !empty ? (
            // «Не проверены» is the last week only (UNCHECKED_DAYS), as the count beside it
            <p className="rep-feed-end-text">{filter.unchecked ? "Старше недели — не в счёте" : "Раньше отчётов нет"}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
