"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { dayTitle, shortHm } from "@/lib/daily-report/format";
import type { TeamDay, TeamDayRow } from "@/lib/daily-report/types";
import { nowHm, type Ymd } from "@/lib/datetime/calendar";
import { isWorkdayOf } from "@/lib/desk/reports-address";
import { useCompanySettings } from "@/lib/dictionary-queries";

import { Ledger, ledgerOrder, type LedgerRow } from "./Ledger";
import { RollCall } from "./RollCall";

export type SummaryViewProps = {
  day: TeamDay | undefined;
  /** The previous day's data on screen while the asked one loads. */
  stale: boolean;
  failed: boolean;
  onRetry: () => void;
  /** The search (F): a row stays when it matches. */
  match: (row: Pick<TeamDayRow, "full_name" | "position">) => boolean;
  selectedId: string | null;
  openId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string | null) => void;
  pointsOn: boolean;
  now: Date;
  today: Ymd;
  /** Set when the page opened on the last working day by itself (morning rule): the band «Сегодня…» shows. */
  autoFrom: Ymd | null;
  /** `settings.daily_report.ask_from`, "HH:MM". */
  askFrom: string;
  onToday: () => void;
};

/** The view's own width from which the roll call stands as a rail beside the ledger (≈ a 1360-px window). */
const RAIL_FROM = 1060;

const handedIn = (row: TeamDayRow): row is LedgerRow => row.state === "submitted" && row.report?.status === "submitted";

/** «пятницу, 14 ноября» — a day as «Показываю …» takes it. */
export function dayAccusative(ymd: Ymd): string {
  const title = dayTitle(ymd);
  const lower = title.charAt(0).toLowerCase() + title.slice(1);
  return lower.replace(/^(пятниц|сред|суббот)а/, "$1у");
}

/** «Суббота — выходной», «26 октября — праздник». */
export function offLine(ymd: Ymd, holiday: boolean): string {
  const title = dayTitle(ymd);
  const [weekday, date] = title.split(", ");
  return holiday ? `${date ?? title} — праздник` : `${weekday} — выходной`;
}

/** The view's width, measured after layout and drawn before paint: the rail never flashes as a strip. */
function useWidth(): [(node: HTMLDivElement | null) => void, number, HTMLDivElement | null] {
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
  return [setNode, width, node];
}

/** The shell's right panel is open (`html[data-desk-panel]`, DeskShell): the rail gives way to the strip. */
function subscribePanel(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-desk-panel"] });
  return () => observer.disconnect();
}
const panelNow = () => document.documentElement.hasAttribute("data-desk-panel");
const panelOnServer = () => false;

/** The ids handed in that the director has seen on this day: the rest wait behind the pill. */
type Seen = { date: string; ids: ReadonlySet<string>; risen: ReadonlySet<string> };

/** The day while it loads: the ledger's head and its first entries, the roll call's place (D-122). */
function SummaryBone({ wide }: { wide: boolean }) {
  const entry = (key: number) => (
    <div key={key} className="rep-day-bone-entry">
      <span className="flex items-start gap-3">
        <Bone round w={32} h={32} />
        <span className="flex flex-1 flex-col gap-1.5 pt-0.5">
          <Bone h={14} w="70%" />
          <Bone h={11} w="45%" />
          <Bone h={12} w="60%" />
        </span>
      </span>
      <span className="flex flex-col gap-2 pt-0.5">
        <Bone h={15} w="92%" />
        <Bone h={15} w="64%" />
      </span>
      <Bone h={12} w={36} className="justify-self-end" />
    </div>
  );
  return (
    <div className="rep-day-cols" data-wide={wide ? "" : undefined}>
      {!wide ? <Bone h={44} className="rounded-[12px]" /> : null}
      <SkeletonGroup grow className="rep-day-ledger rep-day-bone">
        <div className="rep-day-ledger-head">
          <Bone h={14} w={110} />
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

/**
 * «Отчёты → Сводка» on the desk (D-183): the day read as a ledger of what people did — only the
 * handed-in reports, newest first, the words in full — and beside it the roll call: how many of
 * those who owed it handed it in, who we wait for (with «Напомнить»), who missed it, who is away.
 * A report that comes while the director reads waits behind a pill on top, never pushes the words
 * under the eyes. In the morning the page may open on the last working day (`autoFrom`): a band
 * says so and leads to today (T). A day off says so above the ledger.
 */
export function SummaryView({
  day,
  stale,
  failed,
  onRetry,
  match,
  selectedId,
  openId,
  onSelect,
  onOpen,
  pointsOn,
  now,
  today,
  autoFrom,
  askFrom,
  onToday,
}: SummaryViewProps) {
  const settings = useCompanySettings();
  const rules = settings.data?.daily_report;
  const [root, width, view] = useWidth();
  const panelOpen = useSyncExternalStore(subscribePanel, panelNow, panelOnServer);
  const wide = width >= RAIL_FROM && !panelOpen;
  const [expanded, setExpanded] = useState(false);
  // a choice made by the mouse is already in view; one made by the keys is brought into it
  const pointed = useRef(0);

  // what the director has seen of this day: set at its first sight, so a first load shows everything at once
  const [seen, setSeen] = useState<Seen | null>(null);
  const submitted = day ? day.rows.filter(handedIn) : [];
  if (day && !stale && seen?.date !== day.date) {
    setSeen({ date: day.date, ids: new Set(submitted.map((row) => row.user_id)), risen: new Set() });
  }

  // the chosen person comes into view when the keys move the choice
  const loaded = Boolean(day);
  useEffect(() => {
    if (!selectedId || !view || !loaded || performance.now() - pointed.current < 300) return;
    view.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId, view, loaded]);

  const holidays = rules?.holidays ?? [];
  const band = autoFrom ? (
    <div className="rep-day-band" data-testid="desk-day-band">
      <span className="rep-day-band-dot" aria-hidden />
      <p className="rep-day-band-text">
        {rules && !isWorkdayOf(rules, today) ? (holidays.includes(today) ? "Сегодня праздник." : "Сегодня выходной.") : `Отчёты за сегодня — с ${shortHm(askFrom)}.`}{" "}
        <span className="rep-day-band-quiet">Показываю {dayAccusative(autoFrom)}</span>
      </p>
      <button type="button" className="rep-day-band-go desk-focus" onClick={onToday}>
        Открыть сегодня <Kbd>T</Kbd>
      </button>
    </div>
  ) : null;

  if (!day) {
    return (
      <div ref={root} className="rep-day" data-testid="desk-reports-day" aria-busy={!failed || undefined}>
        {band}
        {failed ? (
          <EmptyState
            title="Не получилось загрузить"
            hint="Отчёты за этот день не пришли — проверьте связь и попробуйте ещё раз"
            action={
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Повторить
              </Button>
            }
          />
        ) : (
          <SummaryBone wide={wide} />
        )}
      </div>
    );
  }

  const known = seen?.date === day.date ? seen : null;
  const rows = day.rows.filter(match);
  const handed = rows.filter(handedIn).sort(ledgerOrder);
  // nothing to read yet: a new report comes straight in; else it waits behind the pill
  const shownBefore = handed.filter((row) => known?.ids.has(row.user_id));
  const held = known && shownBefore.length > 0 ? handed.filter((row) => !known.ids.has(row.user_id)) : [];
  const ledger = held.length > 0 ? shownBefore : handed;
  const risen = known?.risen ?? new Set<string>();
  const showHeld = () => {
    if (!known) return;
    const ids = held.map((row) => row.user_id);
    setSeen({ date: known.date, ids: new Set([...known.ids, ...ids]), risen: new Set(ids) });
    view?.querySelector("[data-testid='desk-ledger']")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const holiday = holidays.includes(day.date);
  const offWord = day.workday ? null : holiday ? "праздник" : "выходной";
  const narrowed = rows.length < day.rows.length;
  const closedThrough = rules?.checked_on ?? null;
  const live = day.today || closedThrough === null || day.date > closedThrough;
  const empty =
    narrowed && rows.length === 0
      ? { title: "Никого не нашлось", hint: "Поиск — по имени и должности" }
      : narrowed && day.rows.some(handedIn)
        ? { title: "Среди сдавших никого по поиску" }
        : day.today && nowHm(now) < askFrom
          ? { title: "Отчёты приходят к вечеру", hint: `Лента попросит каждого сдать отчёт с ${shortHm(askFrom)}` }
          : day.today
            ? { title: "Пока ни одного отчёта" }
            : offWord
              ? { title: offWord === "праздник" ? "В праздник отчётов не сдавали" : "В выходной отчётов не сдавали" }
              : { title: "За этот день отчётов нет" };

  const rollCall = (
    <RollCall
      day={day}
      rows={rows}
      wide={wide}
      expanded={expanded || Boolean(openId && rows.some((row) => row.user_id === openId && !handedIn(row)))}
      onExpand={setExpanded}
      live={live}
      offWord={offWord}
      pointsOn={pointsOn}
      now={now}
      selectedId={selectedId}
      openId={openId}
      onSelect={onSelect}
      onOpen={onOpen}
    />
  );

  return (
    <div
      ref={root}
      className="rep-day"
      data-testid="desk-reports-day"
      data-stale={stale ? "" : undefined}
      aria-busy={stale || undefined}
      onPointerDown={() => {
        pointed.current = performance.now();
      }}
    >
      {band}
      {offWord ? (
        <p className="rep-day-off" data-testid="desk-day-off">
          {offLine(day.date, holiday)}
          {handed.length > 0 ? <span className="rep-day-off-quiet"> · отчёты по желанию, без очков</span> : null}
        </p>
      ) : null}
      <div className="rep-day-cols" data-wide={wide ? "" : undefined}>
        {wide ? null : rollCall}
        <Ledger
          rows={ledger}
          held={held.length}
          risen={risen}
          onShowHeld={showHeld}
          empty={empty}
          now={now}
          selectedId={selectedId}
          openId={openId}
          onSelect={onSelect}
          onOpen={onOpen}
        />
        {wide ? rollCall : null}
      </div>
    </div>
  );
}
