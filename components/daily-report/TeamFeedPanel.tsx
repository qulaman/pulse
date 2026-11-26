"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MiniMark } from "@/components/brand/MiniMark";
import { PersonFace } from "@/components/people/PeoplePicker";
import { HapticSwitch } from "@/components/ui/HapticSwitch";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { useTeamDailyReportDay } from "@/lib/daily-report/queries";
import { useCheckReports, type ReportsFeed } from "@/lib/daily-report/review";
import {
  batchCheckIds,
  checkedManyText,
  dayCountLine,
  dayHasContent,
  dayHead,
  missedLine,
  todayStrip,
  withKept,
  type KeptReport,
  type ReportsAddress,
} from "@/lib/daily-report/team-feed";
import type { FeedDay, FeedReport } from "@/lib/daily-report/types";
import type { Ymd } from "@/lib/datetime/calendar";
import { shortName } from "@/lib/people/names";
import { usePeople, useTeam } from "@/lib/people/queries";
import { UNDO_MS } from "@/lib/tasks/grace";

import { LoadFailed, TeamRollCall } from "./TeamDayPanel";
import { ChecksIcon, CheckIcon, TeamReportCard, TeamReportFold } from "./TeamReportCard";
import { FeedDaysBone, ReportCardBone, StripBone } from "./TeamSkeletons";

const ChevronRight = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const ChevronDown = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const Cross = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden className="shrink-0">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/**
 * «Отчёты → Подряд» on the director's phone (D-198, design E): today's strip «4 из 10 сдали
 * сегодня · Ждём 4 ›» (the roll call with «Напомнить»), the chips «Все / Не проверены N / Человек ▾»,
 * then the days in a row down — today on top, each with its count, «Проверить все» and the people
 * without a report — loaded further as the finger gets near the end, down to «Раньше отчётов нет».
 */
export function TeamFeedPanel({
  address,
  onPerson,
  onUnchecked,
  today,
  now,
  companyId,
  feed,
  uncheckedCount,
}: {
  address: ReportsAddress;
  onPerson: (userId: string | null) => void;
  onUnchecked: (on: boolean) => void;
  today: Ymd;
  now: Date;
  companyId: string | undefined;
  feed: ReportsFeed;
  uncheckedCount: number | undefined;
}) {
  const { check } = useCheckReports();
  const [rollOpen, setRollOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  // under «Не проверены» a checked report stays where it stood, folded to a line, until the filter changes
  const [kept, setKept] = useState<ReadonlyMap<string, KeptReport>>(new Map());
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  // …and so does its day, when the next load of the filtered feed no longer lists it
  const [keptDays, setKeptDays] = useState<ReadonlyMap<Ymd, FeedDay>>(new Map());

  const days = useMemo(() => {
    const loaded = feed.days;
    if (!loaded || !address.unchecked || keptDays.size === 0) return loaded;
    const listed = new Set(loaded.map((day) => day.date));
    const gone = [...keptDays.values()].filter((day) => !listed.has(day.date)).map((day) => ({ ...day, reports: [], missed_people: [] }));
    return gone.length ? [...loaded, ...gone].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) : loaded;
  }, [feed.days, address.unchecked, keptDays]);
  const todayDay = days?.find((day) => day.today) ?? null;
  const showStrip = !address.who;

  const fold = useCallback((day: FeedDay, items: readonly KeptReport[], on: boolean) => {
    const at = new Date().toISOString();
    if (on) setKeptDays((was) => (was.has(day.date) ? was : new Map(was).set(day.date, day)));
    setKept((was) => {
      const next = new Map(was);
      for (const item of items) next.set(item.report.id, { after: item.after, report: { ...item.report, checked_at: on ? at : null } });
      return next;
    });
    setFolded((was) => {
      const next = new Set(was);
      for (const item of items) {
        if (on) next.add(item.report.id);
        else next.delete(item.report.id);
      }
      return next;
    });
  }, []);

  /** «Проверить» / its undo on one card; under «Не проверены» the card folds in place. */
  const checkOne = (day: FeedDay, report: FeedReport, after: string | null, on: boolean) => {
    check([report.id], on);
    if (address.unchecked) fold(day, [{ report, after }], on);
  };

  /** «Проверить все» of a day — only the reports already seen — with 5 s «Отменить» (D-139). */
  const checkDay = (day: FeedDay, list: readonly FeedReport[]) => {
    const ids = batchCheckIds(list.filter((report) => !folded.has(report.id)));
    if (ids.length === 0) return;
    const items = ids.map((id) => {
      const index = list.findIndex((report) => report.id === id);
      return { report: list[index], after: index > 0 ? list[index - 1].id : null };
    });
    check(ids, true);
    if (address.unchecked) fold(day, items, true);
    toast(checkedManyText(ids.length), {
      // the toast outlives the window by a breath, so the button never vanishes under the finger
      lifetimeMs: UNDO_MS + 400,
      windowMs: UNDO_MS,
      action: {
        label: "Отменить",
        onClick: () => {
          check(ids, false);
          if (address.unchecked) fold(day, items, false);
        },
      },
    });
  };

  useDayLanding(address.day, feed);
  const sentinel = useLoadMore(feed);

  const personName = usePersonName(address.who, days);
  // the days to draw: with reports (the folded ones too) or people without a report; today in one person's feed always
  const listed = (days ?? [])
    .map((day) => ({ day, list: address.unchecked ? withKept(day.reports, kept, day.date) : day.reports }))
    .filter(({ day, list }) => list.length > 0 || dayHasContent(day) || (day.today && !showStrip && !address.unchecked));
  const empty = days !== undefined && listed.length === 0 && !feed.hasMore;

  return (
    <div data-testid="reports-feed">
      {showStrip ? (
        todayDay ? (
          <TodayStrip day={todayDay} onOpen={() => setRollOpen(true)} />
        ) : days === undefined && !feed.error ? (
          <StripBone />
        ) : null
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Какие отчёты">
        <FilterChip on={!address.unchecked} onClick={() => onUnchecked(false)} testId="chip-all">
          Все
        </FilterChip>
        <FilterChip on={address.unchecked} onClick={() => onUnchecked(!address.unchecked)} testId="chip-unchecked">
          Не проверены
          {uncheckedCount ? <span className="nums font-bold">{uncheckedCount}</span> : null}
        </FilterChip>
        {address.who ? (
          <FilterChip on onClick={() => onPerson(null)} testId="chip-person" label={`Показать всех, не только ${personName}`}>
            <span className="max-w-[9.5rem] truncate">{personName || "Человек"}</span>
            <Cross />
          </FilterChip>
        ) : (
          <FilterChip on={false} onClick={() => setPeopleOpen(true)} testId="chip-person">
            Человек
            <ChevronDown />
          </FilterChip>
        )}
      </div>

      {days === undefined ? (
        feed.error ? (
          <LoadFailed onRetry={feed.retry} />
        ) : (
          <FeedDaysBone />
        )
      ) : empty ? (
        <EmptyFeed address={address} name={personName} />
      ) : (
        <>
          {listed.map(({ day, list }) => (
            <FeedDayBlock
              key={day.date}
              day={day}
              now={now}
              address={address}
              withStrip={showStrip}
              list={list}
              folded={folded}
              onCheck={checkOne}
              onCheckDay={checkDay}
              onPerson={address.who ? undefined : onPerson}
            />
          ))}
          <div ref={sentinel} aria-hidden className="h-px" />
          {feed.loadingMore ? (
            <div className="mt-2">
              <ReportCardBone />
            </div>
          ) : null}
          {!feed.hasMore && listed.length > 0 ? (
            <p className="mt-6 text-center text-[13px] leading-[18px] text-muted" data-testid="feed-end">
              {/* «Не проверены» is the last week only (UNCHECKED_DAYS), as the count on the chip */}
              {address.unchecked ? "Старше недели — не в счёте" : "Раньше отчётов нет"}
            </p>
          ) : null}
        </>
      )}

      <RollCallSheet open={rollOpen} onClose={() => setRollOpen(false)} today={today} companyId={companyId} />
      <PeopleSheet
        open={peopleOpen}
        onClose={() => setPeopleOpen(false)}
        onPick={(userId) => {
          setPeopleOpen(false);
          onPerson(userId);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The strip, the chips                                                        */
/* -------------------------------------------------------------------------- */

/** «4 из 10 сдали сегодня · Ждём 4 ›» — the roll call with «Напомнить» a tap away. */
function TodayStrip({ day, onOpen }: { day: FeedDay; onOpen: () => void }) {
  const strip = todayStrip(day);
  return (
    <div className="flex min-h-[52px] items-center gap-2.5 rounded-[16px] border border-border/80 bg-surface/90 py-1 pl-3.5 pr-1.5" data-testid="today-strip">
      {strip.big ? (
        <span className="nums shrink-0 whitespace-nowrap font-display text-[15px] font-semibold leading-5">
          <b className="text-[20px] font-bold">{strip.big}</b>
          {strip.of ? ` ${strip.of}` : ""}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-muted">{strip.words}</span>
      <button
        type="button"
        onClick={onOpen}
        className="relative inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-[12px] border border-border bg-surface-2 pl-3 pr-2 font-display text-[14px] font-semibold leading-5 transition-transform duration-[120ms] active:scale-[0.96]"
        data-testid="today-strip-open"
      >
        <span className="nums">{strip.waiting > 0 ? `Ждём ${strip.waiting}` : "Кто сдал"}</span>
        <span className="text-muted">
          <ChevronRight />
        </span>
        <HapticSwitch />
      </button>
    </div>
  );
}

/** A filter chip of the mock: on — light on dark, never the brand colour (D-195). */
export function FilterChip({
  on,
  onClick,
  children,
  testId,
  label,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      data-testid={testId}
      className={`relative inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 font-display text-[14px] font-semibold leading-4 tracking-[-0.01em] transition-[transform,background-color,color,border-color] duration-[120ms] active:scale-[0.96] ${
        on ? "border-text bg-text text-bg" : "border-border text-muted"
      }`}
    >
      {children}
      <HapticSwitch />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* A day                                                                       */
/* -------------------------------------------------------------------------- */

function FeedDayBlock({
  day,
  now,
  address,
  withStrip,
  list,
  folded,
  onCheck,
  onCheckDay,
  onPerson,
}: {
  day: FeedDay;
  now: Date;
  address: ReportsAddress;
  /** Today's strip is on screen: today's count is said there once (D-194). */
  withStrip: boolean;
  list: FeedReport[];
  folded: ReadonlySet<string>;
  onCheck: (day: FeedDay, report: FeedReport, after: string | null, on: boolean) => void;
  onCheckDay: (day: FeedDay, list: readonly FeedReport[]) => void;
  onPerson?: (userId: string) => void;
}) {
  const head = dayHead(day.date, now);
  const batch = batchCheckIds(list.filter((report) => !folded.has(report.id))).length;
  // the team's count is the team's: one person's feed and today under the strip go without it
  const count = address.who || (day.today && withStrip) ? "" : dayCountLine(day);
  const line = [count, missedLine(day.missed_people, Boolean(address.who))].filter(Boolean).join(" · ");

  return (
    <section id={`feed-day-${day.date}`} className="mt-3" style={{ scrollMarginTop: "calc(env(safe-area-inset-top) + 72px)" }} data-testid="feed-day" data-day={day.date}>
      <div className="flex min-h-[44px] items-center gap-2 px-1">
        <h2 className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="shrink-0 font-display text-[15px] font-bold leading-5">{head.title}</span>
          <span className="truncate text-[13px] leading-[18px] text-muted">{head.sub}</span>
        </h2>
        {batch > 1 ? (
          <button
            type="button"
            onClick={() => onCheckDay(day, list)}
            className="relative -mr-1 inline-flex min-h-[44px] shrink-0 items-center gap-1.5 px-1 font-display text-[14px] font-semibold leading-5 active:opacity-70"
            data-testid="check-day"
          >
            <span className="text-muted">
              <ChecksIcon />
            </span>
            Проверить все
            <span className="nums text-muted">· {batch}</span>
            <HapticSwitch />
          </button>
        ) : null}
      </div>
      {line ? <p className="nums -mt-1 mb-2 px-1 text-[13px] leading-[18px] text-muted">{line}</p> : null}
      {list.length > 0 ? (
        <div className="flex flex-col gap-2">
          {list.map((report, index) => {
            const after = index > 0 ? list[index - 1].id : null;
            return folded.has(report.id) ? (
              <TeamReportFold key={report.id} report={report} onUndo={() => onCheck(day, report, after, false)} />
            ) : (
              <TeamReportCard
                key={report.id}
                report={report}
                onCheck={(on) => onCheck(day, report, after, on)}
                onPerson={onPerson ? () => onPerson(report.user_id) : undefined}
              />
            );
          })}
        </div>
      ) : day.today && !line ? (
        <p className="px-1 text-[14px] leading-5 text-muted">Отчёта пока нет</p>
      ) : null}
    </section>
  );
}

function EmptyFeed({ address, name }: { address: ReportsAddress; name: string }) {
  const [title, sub] = address.unchecked
    ? ["Все отчёты проверены", address.who ? `${name || "У человека"} — всё проверено` : "Новые появятся здесь, как только их сдадут"]
    : address.who
      ? [`Отчётов${name ? ` у ${name}` : ""} пока нет`, "Сданные появятся здесь"]
      : ["Отчётов пока нет", "Сданные появятся здесь"];
  return (
    <div className="mt-4 flex flex-col items-center rounded-[20px] border border-border/70 px-6 py-8 text-center" data-testid="feed-empty">
      {address.unchecked ? (
        <span aria-hidden className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-ok/12 text-ok">
          <CheckIcon size={18} />
        </span>
      ) : null}
      <p className="font-display text-[17px] font-semibold">{title}</p>
      <p className="mt-1 text-[14px] leading-[19px] text-muted">{sub}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sheets                                                                      */
/* -------------------------------------------------------------------------- */

/** Today's roll call: the team's day is read when the sheet opens, live while it is up. */
function RollCallSheet({ open, onClose, today, companyId }: { open: boolean; onClose: () => void; today: Ymd; companyId: string | undefined }) {
  const day = useTeamDailyReportDay(today, companyId, open);
  return (
    <Sheet open={open} onClose={onClose} title="Сегодня">
      <div className="pb-2">
        <TeamRollCall day={day.data?.date === today ? day.data : undefined} failed={day.isError && !day.data} onRetry={() => void day.refetch()} />
      </div>
    </Sheet>
  );
}

/** «Человек ▾»: the team by name; a tap opens that person's reports. */
function PeopleSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (userId: string) => void }) {
  const team = useTeam(open);
  const people = useMemo(() => [...team.members].sort((a, b) => a.full_name.localeCompare(b.full_name, "ru")), [team.members]);
  return (
    <Sheet open={open} onClose={onClose} title="Чьи отчёты">
      <ul className="flex flex-col pb-2" data-testid="people-sheet">
        {people.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              onClick={() => onPick(person.id)}
              className="relative flex min-h-[56px] w-full items-center gap-3 rounded-[12px] px-1 text-left transition-colors duration-[120ms] active:bg-surface-2"
            >
              <PersonFace person={person} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] leading-[22px]">{shortName(person.full_name)}</span>
                {person.position ? <span className="block truncate text-[13px] leading-[18px] text-muted">{person.position}</span> : null}
              </span>
              <span className="text-muted">
                <ChevronRight />
              </span>
              <HapticSwitch />
            </button>
          </li>
        ))}
        {team.isLoading ? <li className="px-1 py-4 text-[14px] text-muted"><MiniMark state="busy" tone="var(--accent)" className="mr-2" />Загружаю…</li> : null}
      </ul>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                       */
/* -------------------------------------------------------------------------- */

/** The person of `?who` by name: the roster, or the feed's own reports while it comes. */
function usePersonName(who: string | null, days: readonly FeedDay[] | undefined): string {
  const people = usePeople(Boolean(who));
  if (!who) return "";
  const person = people.data?.find((row) => row.id === who);
  if (person) return shortName(person.full_name);
  for (const day of days ?? []) {
    const found = day.reports.find((report) => report.user_id === who) ?? day.missed_people.find((row) => row.user_id === who);
    if (found) return shortName(found.full_name);
  }
  return "";
}

/** The feed asks for the page before once the end comes near — a screen and a half ahead. */
function useLoadMore(feed: ReportsFeed): (element: HTMLDivElement | null) => void {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const { hasMore, loadingMore, loadMore } = feed;
  useEffect(() => {
    if (!element || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { rootMargin: "0px 0px 150% 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, hasMore, loadingMore, loadMore]);
  return setElement;
}

/**
 * `?day`: the feed opens on that day — pages are asked for until it (or the nearest older day
 * with reports) is in, then its head comes under the bar. Once per address.
 */
function useDayLanding(target: Ymd | null, feed: ReportsFeed): void {
  const landed = useRef<Ymd | null>(null);
  const { days, hasMore, loadingMore, loadMore } = feed;
  useEffect(() => {
    if (!target || landed.current === target || !days) return;
    // the day itself, or the nearest older one drawn (a day without reports under the filters is not)
    const head = days
      .filter((item) => item.date <= target)
      .map((item) => document.getElementById(`feed-day-${item.date}`))
      .find((element) => element !== null);
    if (head) {
      landed.current = target;
      head.scrollIntoView({ block: "start" });
      return;
    }
    if (hasMore) {
      if (!loadingMore) loadMore();
    } else {
      landed.current = target;
    }
  }, [target, days, hasMore, loadingMore, loadMore]);
}
