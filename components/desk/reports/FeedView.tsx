"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { shortHm } from "@/lib/daily-report/format";
import { prefetchTeamDailyReportDay, useTeamDailyReportDay } from "@/lib/daily-report/queries";
import type { ReportsFeed } from "@/lib/daily-report/review";
import type { FeedDay, FeedReport, ReportsFeedFilter } from "@/lib/daily-report/types";
import { addDays, nowHm, type Ymd } from "@/lib/datetime/calendar";
import { allChecked, checkableIds, dayCountLine, dayHead, landingDay, shownDays } from "@/lib/desk/reports-feed";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { shortName } from "@/lib/people/names";

import { LedgerEntry } from "./Ledger";
import { RollCall } from "./RollCall";

/** The view's own width from which the roll call stands as a rail beside the feed (≈ a 1360-px window). */
const RAIL_FROM = 1060;
/** A day's section counts as «on top» once its top has passed this far under the scroller's top (its head is stuck). */
const ON_TOP_PX = 48;
/** The next page is asked for while the end of the feed is this close under the window. */
const PULL_PX = 900;

/** The desk's only scroller (DeskShell). */
const scroller = () => document.getElementById("desk-main");

/** The view's width, measured after layout and drawn before paint: the rail never flashes as a strip. */
function useWidth(): [(node: HTMLDivElement | null) => void, number] {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      flushSync(() => setWidth(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width];
}

/** The shell's right panel is open (`html[data-desk-panel]`, DeskShell): the rail gives way to the strip. */
function subscribePanel(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-desk-panel"] });
  return () => observer.disconnect();
}
const panelNow = () => document.documentElement.hasAttribute("data-desk-panel");
const panelOnServer = () => false;

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

/** A request to bring a day to the top: each one once (`n`); `day` null — today, the top. */
export type FeedJump = { day: Ymd | null; n: number; smooth: boolean };

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
  /** The day whose head is on top now — the rail's day, ← → and Shift+A start from it. */
  onTopDay: (day: Ymd) => void;
  selectedId: string | null;
  /** The person whose diary is open. */
  openId: string | null;
  onSelect: (reportId: string) => void;
  onOpenReport: (report: FeedReport) => void;
  onOpenPerson: (userId: string, day: Ymd) => void;
  onCheck: (ids: string[], on: boolean) => void;
  onCheckDay: (day: FeedDay) => void;
  onClearFilters: () => void;
};

/** The feed while it loads: two days' heads and their first reports, the rail's place (D-122). */
function FeedBone({ wide }: { wide: boolean }) {
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
    <div className="rep-day-cols" data-wide={wide ? "" : undefined}>
      <SkeletonGroup grow className="rep-feed-list rep-day-bone">
        <div className="rep-feed-head">
          <Bone h={14} w={180} />
        </div>
        {[0, 1, 2].map(entry)}
      </SkeletonGroup>
      {wide ? (
        <SkeletonGroup className="rep-day-roll rep-day-bone">
          <Bone h={32} w={150} />
          <Bone h={4} className="mt-3 rounded-full" />
          <span className="mt-5 flex flex-col gap-3">
            {[0, 1, 2].map((key) => (
              <span key={key} className="flex items-center gap-2.5">
                <Bone round w={24} h={24} />
                <Bone h={13} w="55%" />
              </span>
            ))}
          </span>
        </SkeletonGroup>
      ) : null}
    </div>
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

/** A day's sticky head: «Сегодня · среда, 25 ноября», the team's count and who is without a report, «Проверить все · N». */
function DayHead({ day, today, holiday, director, onCheckDay, onOpenPerson }: { day: FeedDay; today: Ymd; holiday: boolean; director: boolean; onCheckDay: (day: FeedDay) => void; onOpenPerson: (userId: string, day: Ymd) => void }) {
  const head = dayHead(day.date, today);
  const ready = checkableIds(day.reports);
  const done = allChecked(day.reports);
  return (
    <header className="rep-feed-head" data-testid="desk-feed-day-head">
      <h2 className="rep-feed-head-title">
        <span className="rep-feed-head-name">{head.name}</span> <span className="rep-feed-head-date">{head.date}</span>
      </h2>
      <span className="rep-feed-head-sub nums">
        {dayCountLine(day, holiday)}
        <MissedLine day={day} onOpenPerson={onOpenPerson} />
      </span>
      {director && ready.length > 0 ? (
        <Tooltip label="Отметить проверенными все просмотренные отчёты дня" keys={["Shift", "A"]}>
          <button type="button" className="rep-feed-all desk-focus" onClick={() => onCheckDay(day)} data-testid="desk-feed-check-day">
            <CheckCheck size={15} strokeWidth={2.2} aria-hidden />
            Проверить все · <span className="nums">{ready.length}</span>
          </button>
        </Tooltip>
      ) : director && done ? (
        <span className="rep-feed-head-ok" data-testid="desk-feed-day-done">
          <Check size={14} strokeWidth={2.4} aria-hidden />
          все проверены
        </span>
      ) : null}
    </header>
  );
}

/**
 * «Отчёты → Подряд» on the desk (D-198, it replaced «День» of D-183): the reports day after day,
 * today on top — the same reading as «Сводка» (the words in full, the day's tasks, when it came),
 * every day under its own sticky head «Вт, 24 ноября · сдали 9 из 10 · без отчёта: …» with
 * «Проверить все · N». Older days come a week at a time as one scrolls (`useReportsFeed`); the
 * end says «Раньше отчётов нет». The roll call beside it is the day whose head is on top now
 * («Напомнить» — today only, as built). Before `ask_from` today is one short line and yesterday
 * is right under it. A jump (the calendar, ← →, a link with `?day`) loads as far as it needs.
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
  selectedId,
  openId,
  onSelect,
  onOpenReport,
  onOpenPerson,
  onCheck,
  onCheckDay,
  onClearFilters,
}: FeedViewProps) {
  const settings = useCompanySettings();
  const rules = settings.data?.daily_report;
  const holidays: readonly string[] = rules?.holidays ?? [];
  const [root, width] = useWidth();
  const panelOpen = useSyncExternalStore(subscribePanel, panelNow, panelOnServer);
  const wide = width >= RAIL_FROM && !panelOpen;
  const [expanded, setExpanded] = useState(false);
  const filtered = Boolean(filter.who || filter.q || filter.unchecked);

  // under a filter a day without a report of it is not drawn; today stays as the morning's line
  const days = shownDays(feed.days ?? [], filtered);
  const dates = days.map((day) => day.date);
  const first = dates[0] ?? null;

  // the day on top: measured on scroll (one frame at a time), the rail and the keys follow it
  const [topDay, setTopDay] = useState<Ymd | null>(null);
  const latest = useRef({ feed, onTopDay, first });
  useLayoutEffect(() => {
    latest.current = { feed, onTopDay, first };
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
      if (top) {
        setTopDay(top);
        latest.current.onTopDay(top);
      }
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
      requestAnimationFrame(() => scrollToDay(null, first, jump.smooth));
      return;
    }
    const land = landingDay(dates, target);
    if (land) {
      answered.current = jump.n;
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
    requestAnimationFrame(() => scrollToDay(last, first, false));
    // `dates` is in `datesKey`; `feed` changes identity every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, datesKey, feed.days, feed.hasMore, feed.loadingMore]);

  // the rail: the roll call of the day on top, its neighbours loaded ahead
  const railDay = topDay && dates.includes(topDay) ? topDay : (first ?? today);
  const team = useTeamDailyReportDay(railDay, companyId, Boolean(companyId));
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    void prefetchTeamDailyReportDay(queryClient, addDays(railDay, -1));
    if (addDays(railDay, 1) <= today) void prefetchTeamDailyReportDay(queryClient, addDays(railDay, 1));
  }, [companyId, queryClient, railDay, today]);

  if (!feed.days) {
    return (
      <div ref={root} className="rep-day rep-feed" data-testid="desk-feed" aria-busy={!feed.error || undefined}>
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
          <FeedBone wide={wide} />
        )}
      </div>
    );
  }

  const teamDay = team.data;
  const closedThrough = rules?.checked_on ?? null;
  const rollCall = teamDay ? (
    <RollCall
      day={teamDay}
      rows={teamDay.rows}
      wide={wide}
      expanded={expanded}
      onExpand={setExpanded}
      live={teamDay.today || closedThrough === null || teamDay.date > closedThrough}
      offWord={teamDay.workday ? null : holidays.includes(teamDay.date) ? "праздник" : "выходной"}
      pointsOn={pointsOn}
      now={now}
      selectedId={openId}
      openId={openId}
      onSelect={(userId) => onOpenPerson(userId, teamDay.date)}
      onOpen={(userId) => onOpenPerson(userId, teamDay.date)}
    />
  ) : null;

  const hasReports = days.some((day) => day.reports.length > 0);
  const empty = filtered && !hasReports && !feed.hasMore;

  return (
    <div ref={root} className="rep-day rep-feed" data-testid="desk-feed">
      <div className="rep-day-cols" data-wide={wide ? "" : undefined}>
        {wide ? null : rollCall}
        <section className="rep-feed-list" aria-label="Отчёты подряд" data-testid="desk-feed-list">
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
            const holiday = holidays.includes(day.date);
            const morning = day.today && day.reports.length === 0 && !filtered && (!day.workday || holiday || nowHm(now) < askFrom);
            if (morning) {
              return (
                <p key={day.date} className="rep-feed-morning" data-feed-day={day.date} data-testid="desk-feed-morning">
                  <span className="rep-feed-morning-dot" aria-hidden />
                  {holiday ? "Сегодня праздник" : !day.workday ? "Сегодня выходной" : `Отчёты за сегодня — с ${shortHm(askFrom)}`}
                </p>
              );
            }
            return (
              <section key={day.date} className="rep-feed-day" data-feed-day={day.date} data-testid="desk-feed-day" aria-label={dayHead(day.date, today).name}>
                <DayHead day={day} today={today} holiday={holiday} director={director} onCheckDay={onCheckDay} onOpenPerson={onOpenPerson} />
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
                        folding={filter.unchecked}
                        checker={report.checked_by ? checkerName(report.checked_by) : null}
                        onSelect={onSelect}
                        onOpen={onOpenReport}
                        onCheck={onCheck}
                      />
                    ))}
                  </ol>
                )}
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
        {wide ? rollCall : null}
      </div>
    </div>
  );
}
