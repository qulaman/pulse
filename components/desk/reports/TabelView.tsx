"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Face } from "@/components/desk/ui/Face";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { rangeText } from "@/lib/daily-report/format";
import { cellSymbol, cellWords, handedByDay, holidayWords, missedByDay, tabelPeriodWords, tabelTotals } from "@/lib/daily-report/tabel";
import type { TeamPeriodRow } from "@/lib/daily-report/types";
import { parseYmd, weekdayOf, WEEKDAYS_SHORT_RU, type Ymd } from "@/lib/datetime/calendar";

import type { Tabel, TabelDay, TabelPerson } from "./tabel-data";

/** «Все» — the whole team, «С пропусками» — who missed a day of the period. */
export type TabelShow = "team" | "gaps";

export type TabelViewProps = {
  tabel: Tabel | undefined;
  stale: boolean;
  failed: boolean;
  onRetry: () => void;
  /** The period's controls (‹ Ноябрь 2026 ›, «Месяц | Неделя | Свой») — they stand in the card's own bar. */
  controls: ReactNode;
  /** The feed is narrowed to one person: the card shows that person's row alone, folded or not. */
  who: string | null;
  /** Folded — the days and how many handed in each one; open — the people under them (D-201). */
  folded: boolean;
  onFold: (folded: boolean) => void;
  show: TabelShow;
  onShow: (show: TabelShow) => void;
  selectedId: string | null;
  openId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string | null) => void;
  /** A day's head: the feed under the card at that day. */
  onDay: (day: Ymd) => void;
  /** A cell: the person's «Дневник» on that day — the words of it (D-198). */
  onCell: (id: string, day: Ymd) => void;
  today: Ymd;
};

/* ---- the grid's measures: a day a column, marks while a day has room for one, colour below ---- */

const NAME_W = 184;
const NAME_W_NARROW = 168;
/**
 * Below this a day is colour only (a quarter, a month in a narrow window or beside the open panel),
 * the sheet scrolls sideways, the names stay. 24, not 26: a month of 31 days with the four totals
 * keeps its marks at 1440 (24.1 px a day); a mark is 20 px wide.
 */
const MARK_MIN = 24;
/** Folded, a day holds only a number of two digits: it keeps its numbers in a narrower window (a 1280-px laptop). */
const COUNT_MIN = 18;
const MARK_MAX = 64;
const DENSE_MIN = 13;
/** The totals' widths — reports-tabel.css `.rep-tabel-totals [data-col]` says the same. */
const TOTAL_W = { submitted: 44, missed: 58, excused: 48, rate: 50 } as const;

type Mode = "marks" | "dense";

function measures(width: number, days: number, excused: boolean, least: number = MARK_MIN) {
  const name = width > 0 && width < 920 ? NAME_W_NARROW : NAME_W;
  const totals = TOTAL_W.submitted + TOTAL_W.missed + TOTAL_W.rate + (excused ? TOTAL_W.excused : 0);
  const room = width - name - totals - 2;
  const mode: Mode = width === 0 || room / Math.max(1, days) >= least ? "marks" : "dense";
  const [min, max] = mode === "marks" ? [least, MARK_MAX] : [DENSE_MIN, 40];
  return {
    mode,
    totals,
    // days grow to their most first, whatever is left stays between the days and the totals
    columns: `${name}px repeat(${days}, minmax(${min}px, ${max}px)) minmax(0, 1fr) ${totals}px`,
    least: name + days * min + totals,
  };
}

/* ---- words ---- */

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const weekday = (day: Ymd) => WEEKDAYS_SHORT_RU[weekdayOf(day)];
/** «ср, 12 нояб.» */
const dayLabel = (day: Ymd) => `${weekday(day)}, ${rangeText(day, day)}`;
const SHORT_MONTHS = ["янв.", "февр.", "март", "апр.", "май", "июнь", "июль", "авг.", "сент.", "окт.", "нояб.", "дек."] as const;

/* ---- one person's row ---- */

type RowProps = {
  person: TabelPerson;
  days: readonly TabelDay[];
  mode: Mode;
  excused: boolean;
  selected: boolean;
  open: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string | null) => void;
  onCell: (id: string, day: Ymd) => void;
};

/** The day's place in the column: a weekend dimmed, a holiday hatched, a Monday after a rule, today outlined. */
function dayAttrs(day: TabelDay, index: number) {
  return {
    "data-off": day.weekend && !day.holiday ? "" : undefined,
    "data-hol": day.holiday ? "" : undefined,
    "data-mon": index > 0 && weekday(day.day) === "пн" ? "" : undefined,
    "data-today": day.today ? "" : undefined,
  };
}

function Totals({ row, excused, as = "row" }: { row: Pick<TeamPeriodRow, "submitted" | "missed" | "excused" | "submit_rate">; excused: boolean; as?: "row" | "foot" }) {
  return (
    <span className="rep-tabel-totals nums" data-as={as}>
      <span data-col="submitted">{row.submitted}</span>
      <span data-col="missed" data-tone={row.missed > 0 ? "danger" : "quiet"}>
        {row.missed > 0 ? row.missed : "—"}
      </span>
      {excused ? (
        <span data-col="excused" data-tone="quiet">
          {(row.excused ?? 0) > 0 ? row.excused : "—"}
        </span>
      ) : null}
      <span data-col="rate" data-tone={row.submit_rate === null ? "quiet" : undefined}>
        {row.submit_rate === null ? "—" : `${Math.round(row.submit_rate * 100)}%`}
      </span>
    </span>
  );
}

const Row = memo(function Row({ person, days, mode, excused, selected, open, onSelect, onOpen, onCell }: RowProps) {
  const id = person.row.user_id;
  return (
    <div
      role="row"
      className="rep-tabel-row"
      data-row-key={id}
      data-selected={selected ? "" : undefined}
      data-open={open ? "" : undefined}
      data-gone={person.gone ? "" : undefined}
      data-testid="desk-tabel-row"
      onClick={() => onSelect(id)}
      onDoubleClick={() => onOpen(id)}
    >
      <span role="rowheader" className="rep-tabel-name" data-tip="name">
        <button
          type="button"
          className="desk-focus rep-tabel-name-button"
          aria-label={`${person.row.full_name} — открыть дневник`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(id);
          }}
        >
          <Face person={{ id, full_name: person.row.full_name, avatar_url: person.row.avatar_url }} size={mode === "dense" ? 18 : 20} />
          <span className="rep-tabel-name-text">{person.row.full_name}</span>
        </button>
      </span>
      {person.cells.map((cell, index) => (
        <span
          key={cell.day}
          role="cell"
          className="rep-tabel-cell"
          data-i={index}
          data-state={cell.state}
          data-testid="desk-tabel-cell"
          {...dayAttrs(days[index], index)}
          onClick={(event) => {
            // a day of the row: its words in the diary, on that day
            event.stopPropagation();
            onCell(id, cell.day);
          }}
        >
          <span className="rep-tabel-mark">{mode === "marks" ? cellSymbol(cell) : null}</span>
        </span>
      ))}
      <span aria-hidden />
      <span role="cell" className="rep-tabel-end">
        <Totals row={person.row} excused={excused} />
      </span>
    </div>
  );
});

/* ---- the one tooltip of the sheet ---- */

type Tip = { text: string; x: number; y: number; below: boolean };

const TIP_DELAY = 280;

/**
 * One tooltip for the whole sheet (40 people × 92 days are plain cells): the cell, the day's head
 * or the bottom row under the mouse says itself — who, which day, what stands there, the times.
 * After a short rest; once it shows it follows the mouse from cell to cell without waiting.
 */
function useSheetTip(tabel: Tabel | undefined, shown: readonly TabelPerson[], team: readonly TabelPerson[]) {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const byId = useMemo(() => new Map(shown.map((person) => [person.row.user_id, person])), [shown]);
  const missed = useMemo(() => (tabel ? missedByDay(shown, tabel.days.length) : []), [tabel, shown]);
  const handed = useMemo(() => (tabel ? handedByDay(team, tabel.days.length) : []), [tabel, team]);

  const textOf = (target: HTMLElement): string | null => {
    if (!tabel) return null;
    const cell = target.closest<HTMLElement>("[data-i], [data-head], [data-foot], [data-handed], [data-tip]");
    if (!cell) return null;
    if (cell.dataset.handed !== undefined) {
      const index = Number(cell.dataset.handed);
      const day = tabel.days[index];
      const count = handed[index];
      if (!day || !count) return null;
      const waited = day.today ? count.due - count.submitted - count.missed : 0;
      const said =
        count.due > 0
          ? [`сдали ${count.submitted} из ${count.due}`, count.missed ? `не сдали ${count.missed}` : "", waited > 0 ? `ждём ${waited}` : ""].filter(Boolean).join(" · ")
          : day.holiday
            ? holidayWords(day.day)
            : day.weekend
              ? "выходной"
              : day.future
                ? "ещё впереди"
                : "отчёт не нужен";
      return `${capital(dayLabel(day.day))} · ${said}${count.due > 0 ? " — к этому дню" : ""}`;
    }
    if (cell.dataset.head !== undefined || cell.dataset.foot !== undefined) {
      const index = Number(cell.dataset.head ?? cell.dataset.foot);
      const day = tabel.days[index];
      if (!day) return null;
      const extra = day.holiday ? holidayWords(day.day) : day.weekend ? "выходной" : day.future ? "ещё впереди" : `не сдали ${missed[index] ?? 0}`;
      return `${capital(dayLabel(day.day))} · ${extra}${cell.dataset.head !== undefined && !day.future ? " — к этому дню" : ""}`;
    }
    const key = cell.closest<HTMLElement>("[data-row-key]")?.dataset.rowKey;
    const person = key ? byId.get(key) : undefined;
    if (!person) return null;
    if (cell.dataset.tip === "name") {
      return [person.row.full_name, person.row.position, person.gone ? "больше не в команде" : null].filter(Boolean).join(" · ");
    }
    const index = Number(cell.dataset.i);
    const day = tabel.days[index];
    const one = person.cells[index];
    if (!day || !one) return null;
    return `${person.row.full_name} · ${dayLabel(day.day)} · ${cellWords(one, day, tabel.rules, person.person)}`;
  };

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setTip(null);
  };

  const onOver = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const text = textOf(target);
    if (!text) {
      hide();
      return;
    }
    const box = (target.closest("[data-i], [data-head], [data-foot], [data-handed], [data-tip]") as HTMLElement).getBoundingClientRect();
    const next: Tip = { text, x: box.left + box.width / 2, y: box.top < 64 ? box.bottom : box.top, below: box.top < 64 };
    if (timer.current) clearTimeout(timer.current);
    if (tip) {
      setTip(next);
      return;
    }
    timer.current = setTimeout(() => setTip(next), TIP_DELAY);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const node =
    tip && typeof document !== "undefined"
      ? createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[80] whitespace-nowrap rounded-[8px] border border-border bg-surface-2 px-2 py-1 text-[12px] leading-4 text-text"
            style={{ left: tip.x, top: tip.below ? tip.y + 6 : tip.y - 6, transform: `translate(-50%, ${tip.below ? "0" : "-100%"})`, boxShadow: "var(--shadow-raised)" }}
          >
            {tip.text}
          </span>,
          document.body,
        )
      : null;
  return { onOver, hide, node };
}

/* ---- the sheet ---- */

function MonthLabels({ days }: { days: readonly TabelDay[] }) {
  return (
    <>
      {days.map((day, index) => {
        const parts = parseYmd(day.day);
        const first = index === 0 || parts?.day === 1;
        return (
          <span key={day.day} className="rep-tabel-month" aria-hidden>
            {first && parts ? SHORT_MONTHS[parts.month - 1] : null}
          </span>
        );
      })}
    </>
  );
}

function DayHeads({ days, mode, onDay }: { days: readonly TabelDay[]; mode: Mode; onDay: (day: Ymd) => void }) {
  return (
    <>
      {days.map((day, index) => {
        const number = parseYmd(day.day)?.day ?? "";
        // colour only: the Mondays and today carry their numbers, the rest stay quiet
        const label = mode === "marks" || weekday(day.day) === "пн" || day.today || index === 0;
        return (
          <span key={day.day} role="columnheader" className="rep-tabel-dhead" data-head={index} {...dayAttrs(day, index)}>
            <button
              type="button"
              className="desk-focus rep-tabel-dhead-button"
              data-testid="desk-tabel-day"
              data-day={day.day}
              disabled={day.future}
              aria-label={`${capital(dayLabel(day.day))} — к отчётам этого дня`}
              onClick={() => onDay(day.day)}
            >
              {label ? <span className="rep-tabel-dnum nums">{number}</span> : null}
              {mode === "marks" ? <span className="rep-tabel-dwd">{weekday(day.day)}</span> : null}
            </button>
          </span>
        );
      })}
    </>
  );
}

function Foot({ days, missed, mode }: { days: readonly TabelDay[]; missed: readonly number[]; mode: Mode }) {
  const most = Math.max(1, ...missed);
  return (
    <>
      {days.map((day, index) => {
        const n = missed[index] ?? 0;
        return (
          <span key={day.day} className="rep-tabel-foot-cell" data-foot={index} {...dayAttrs(day, index)}>
            {n > 0 ? (
              mode === "marks" ? (
                <span className="nums rep-tabel-foot-n">{n}</span>
              ) : (
                <span className="rep-tabel-foot-bar" style={{ height: `${Math.max(25, (n / most) * 100)}%` }} />
              )
            ) : null}
          </span>
        );
      })}
    </>
  );
}

/**
 * The folded card's one row (D-201): how many handed in each day. A day everybody handed in is
 * quiet, a day with a miss is red, a day still waited for is the ink; colour only — a bar of the
 * share. A cell goes to that day in the feed, as its head does.
 */
function Handed({ days, handed, mode, onDay }: { days: readonly TabelDay[]; handed: readonly { submitted: number; due: number; missed: number }[]; mode: Mode; onDay: (day: Ymd) => void }) {
  return (
    <>
      {days.map((day, index) => {
        const count = handed[index];
        const due = count?.due ?? 0;
        // a miss is red; today while people are still waited for is the ink; any other day is quiet
        const tone = !count || due === 0 ? undefined : count.missed > 0 ? "danger" : day.today && count.submitted < due ? "live" : "quiet";
        return (
          <span key={day.day} className="rep-tabel-foot-cell rep-tabel-handed" data-handed={index} data-tone={tone} {...dayAttrs(day, index)}>
            {count && due > 0 ? (
              <button
                type="button"
                className="desk-focus rep-tabel-handed-button"
                data-testid="desk-tabel-handed"
                data-day={day.day}
                aria-label={`${capital(dayLabel(day.day))}: сдали ${count.submitted} из ${due}`}
                onClick={() => onDay(day.day)}
              >
                {mode === "marks" ? (
                  <span className="nums rep-tabel-handed-n">{count.submitted}</span>
                ) : (
                  <span className="rep-tabel-handed-bar" style={{ height: `${Math.max(20, (count.submitted / due) * 100)}%` }} />
                )}
              </button>
            ) : null}
          </span>
        );
      })}
    </>
  );
}

function Legend({ tabel, mode }: { tabel: Tabel; mode: Mode }) {
  const has = (test: (state: string, away: string | null) => boolean) => tabel.people.some((person) => person.cells.some((cell) => test(cell.state, cell.away)));
  const items: { key: string; mark: string; state: string; label: string }[] = [
    { key: "in", mark: "✓", state: "submitted", label: "сдан" },
    { key: "out", mark: "✕", state: "missed", label: "не сдан" },
    ...(has((state) => state === "excused") ? [{ key: "ex", mark: "у", state: "excused", label: "уважительная причина" }] : []),
    // the away marks only where the period has them: a legend of what is not there is noise
    ...(mode === "marks"
      ? [
          ...(has((state, away) => state === "away" && away === "vacation") ? [{ key: "vac", mark: "о", state: "away", label: "отпуск" }] : []),
          ...(has((state, away) => state === "away" && away === "sick") ? [{ key: "sick", mark: "б", state: "away", label: "больничный" }] : []),
          ...(has((state, away) => state === "away" && away === null) ? [{ key: "ob", mark: "о/б", state: "away", label: "отпуск или больничный" }] : []),
        ]
      : has((state) => state === "away")
        ? [{ key: "away", mark: "", state: "away", label: "отпуск, больничный" }]
        : []),
    ...(tabel.days.some((day) => day.holiday) ? [{ key: "hol", mark: "", state: "holiday", label: "праздник" }] : []),
    ...(tabel.days.some((day) => day.today) ? [{ key: "today", mark: "", state: "today", label: "сегодня" }] : []),
  ];
  return (
    <div className="rep-tabel-legend" data-mode={mode}>
      {items.map((item) => (
        <span key={item.key} className="rep-tabel-legend-item">
          <span className="rep-tabel-legend-mark" data-state={item.state} aria-hidden>
            {mode === "marks" ? item.mark : null}
          </span>
          {item.label}
        </span>
      ))}
      <span className="rep-tabel-legend-hint">По дню — его отчёты ниже, по имени — дневник</span>
    </div>
  );
}

/** The card while it loads: its bar and the two rows of the folded sheet (D-122), the people's rows when it is open. */
export function TabelBone({ folded = true }: { folded?: boolean }) {
  return (
    <SkeletonGroup className="rep-tabel rep-tabel-bone">
      <div className="rep-tabel-bar">
        <Bone h={16} w={64} />
        <Bone h={32} w={420} />
        <span className="flex-1" />
        <Bone h={30} w={148} />
      </div>
      <div className="rep-tabel-bone-sheet">
        <Bone h={40} />
        {Array.from({ length: folded ? 1 : 9 }, (_, index) => (
          <div key={index} className="flex h-[30px] items-center gap-3 px-2.5">
            <Bone round w={20} h={20} />
            <Bone h={12} w={128} />
            <Bone h={18} className="flex-1" />
            <Bone h={12} w={160} />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/**
 * The «Табель» card over the feed of «Отчёты» (D-183; one page with the feed — D-201): the period
 * as people × days — a mark a day (✓ сдан, ✕ не сдан, у уважительная, о/б away), weekends dimmed,
 * holidays hatched, today outlined; the totals on the right; never hours, never points. Folded (as
 * it opens) it is two rows — the days and how many handed in each one; «Показать людей» opens the
 * people under them, with the misses of each day at the bottom. With the feed narrowed to one
 * person it is that person's row. A day's head goes to that day in the feed, a name opens the
 * person's diary, a cell — the diary on that day. A quarter turns into colour only and scrolls
 * sideways under the names. The bar holds the period's controls; the period's totals are the right
 * end of the bottom row.
 */
export function TabelView({ tabel, stale, failed, onRetry, controls, who, folded, onFold, show, onShow, selectedId, openId, onSelect, onOpen, onDay, onCell }: TabelViewProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const hasSheet = Boolean(tabel && tabel.people.length > 0);
  // the sheet's width decides marks or colour — measured before the first paint, followed after
  useLayoutEffect(() => {
    const node = sheet.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasSheet]);

  const team = useMemo(() => tabel?.people ?? [], [tabel]);
  // one person: their row alone; «С пропусками» is about the team now — who left keeps their
  // history under «Все», not a gap of today (D-194); folded — no rows at all, the days speak
  const shown = useMemo(() => {
    if (who) return team.filter((person) => person.row.user_id === who);
    if (folded) return [];
    return show === "gaps" ? team.filter((person) => !person.gone && person.row.missed > 0) : team;
  }, [team, who, folded, show]);
  const tip = useSheetTip(tabel, shown, team);

  // a person chosen comes into view under the sticky head
  useEffect(() => {
    const node = sheet.current;
    if (!node || !selectedId) return;
    const row = node.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(selectedId)}"]`);
    if (!row) return;
    const head = node.querySelector<HTMLElement>(".rep-tabel-head")?.offsetHeight ?? 0;
    const foot = node.querySelector<HTMLElement>(".rep-tabel-foot")?.offsetHeight ?? 0;
    const top = row.offsetTop - head;
    const bottom = row.offsetTop + row.offsetHeight + foot - node.clientHeight;
    if (node.scrollTop > top) node.scrollTop = top;
    else if (node.scrollTop < bottom) node.scrollTop = bottom;
  }, [selectedId]);

  if (!tabel) {
    return failed ? (
      <div className="rep-tabel" data-testid="desk-tabel">
        <EmptyState
          title="Не получилось загрузить табель"
          hint="Проверьте связь и попробуйте ещё раз"
          action={
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Повторить
            </Button>
          }
        />
      </div>
    ) : (
      <div data-testid="desk-tabel" aria-busy>
        <TabelBone folded={folded} />
      </div>
    );
  }

  const excused = tabel.people.some((person) => (person.row.excused ?? 0) > 0);
  // folded — the days alone, with the team's own totals beside them; open — over the people shown
  const days = !who && folded;
  const m = measures(width, tabel.days.length, excused, days ? COUNT_MIN : MARK_MIN);
  const missed = missedByDay(shown, tabel.days.length);
  const handed = handedByDay(team, tabel.days.length);
  const foot = days ? tabel.totals : tabelTotals(shown);
  // the counts over the team now (lib/daily-report/tabel.ts): who left stands under its own divider
  const firstGone = who ? -1 : shown.findIndex((person) => person.gone);
  const goneShown = firstGone < 0 ? 0 : shown.length - firstGone;

  return (
    <section className="rep-tabel" aria-label="Табель" data-testid="desk-tabel" data-folded={days ? "" : undefined} data-stale={stale ? "" : undefined} aria-busy={stale || undefined}>
      <div className="rep-tabel-bar">
        <h2 className="rep-tabel-title">Табель</h2>
        {controls}
        <span className="flex-1" />
        {!who && !folded && tabel.people.length > 0 ? (
          <SegmentTabs<TabelShow>
            aria-label="Кого показать"
            value={show}
            onChange={onShow}
            items={[
              { value: "team", label: "Все", count: tabel.totals.people },
              { value: "gaps", label: "С пропусками", count: tabel.totals.gaps },
            ]}
          />
        ) : null}
        {!who && tabel.people.length > 0 ? (
          <button type="button" className="rep-tabel-fold desk-focus" aria-expanded={!folded} onClick={() => onFold(!folded)} data-testid="desk-tabel-fold">
            {folded ? "Показать людей" : "Свернуть"}
            <ChevronDown size={16} aria-hidden />
          </button>
        ) : null}
      </div>

      {tabel.people.length === 0 ? (
        <EmptyState title="За этот период отчитываться было некому" hint="Отчёты сдают сотрудники с первого рабочего дня" />
      ) : (
        <>
          <div
            ref={sheet}
            className="rep-tabel-sheet"
            data-mode={m.mode}
            style={{ "--rep-tabel-cols": m.columns, "--rep-tabel-least": `${m.least}px` } as CSSProperties}
            onMouseOver={tip.onOver}
            onMouseLeave={tip.hide}
            onMouseDown={tip.hide}
            onScroll={tip.hide}
          >
            <div role="table" aria-label={`Табель отчётов, ${tabelPeriodWords(tabel.from, tabel.to)}`} aria-rowcount={shown.length + (who ? 1 : 2) + (firstGone < 0 ? 0 : 1)} className="rep-tabel-grid">
              <div role="rowgroup" className="rep-tabel-head">
                {m.mode === "dense" ? (
                  <div className="rep-tabel-row rep-tabel-months" aria-hidden>
                    <span className="rep-tabel-name" />
                    <MonthLabels days={tabel.days} />
                    <span />
                    <span className="rep-tabel-end" />
                  </div>
                ) : null}
                <div role="row" className="rep-tabel-row rep-tabel-heads">
                  <span role="columnheader" className="rep-tabel-name">
                    {days ? "" : "Сотрудник"}
                  </span>
                  <DayHeads days={tabel.days} mode={m.mode} onDay={onDay} />
                  <span aria-hidden />
                  <span role="columnheader" className="rep-tabel-end">
                    <span className="rep-tabel-totals" data-as="head">
                      <span data-col="submitted">Сдал</span>
                      <span data-col="missed">Не сдал</span>
                      {excused ? <span data-col="excused">Уваж.</span> : null}
                      <span data-col="rate">Доля</span>
                    </span>
                  </span>
                </div>
              </div>

              <div role="rowgroup" className="rep-tabel-body">
                {shown.map((person, index) => (
                  <Fragment key={person.row.user_id}>
                    {index === firstGone ? (
                      // who left: their rows and their own numbers, out of the totals over the sheet and under it
                      <div role="row" className="rep-tabel-row rep-tabel-gone" data-testid="desk-tabel-gone">
                        <span role="rowheader" className="rep-tabel-name">
                          <span className="rep-tabel-gone-text">
                            Больше не в команде · <span className="nums">{goneShown}</span>
                          </span>
                        </span>
                        <span className="rep-tabel-gone-note">не входят в «сдано» и «Не сдали»</span>
                      </div>
                    ) : null}
                    <Row
                      person={person}
                      days={tabel.days}
                      mode={m.mode}
                      excused={excused}
                      selected={person.row.user_id === selectedId}
                      open={person.row.user_id === openId}
                      onSelect={onSelect}
                      onOpen={onOpen}
                      onCell={onCell}
                    />
                  </Fragment>
                ))}
                {shown.length === 0 && !days ? (
                  <p className="rep-tabel-none">
                    {who ? "За этот период человек в табеле не стоит" : "За этот период без пропусков — все сдали"}
                    {!who && show === "gaps" ? (
                      <Button size="sm" variant="ghost" onClick={() => onShow("team")}>
                        Показать всех
                      </Button>
                    ) : null}
                  </p>
                ) : null}
              </div>

              {who ? null : (
                <div role="rowgroup" className="rep-tabel-foot" data-testid="desk-tabel-foot">
                  <div role="row" className="rep-tabel-row">
                    <span role="rowheader" className="rep-tabel-name">
                      {days ? "Сдали" : "Не сдали"}
                    </span>
                    {days ? <Handed days={tabel.days} handed={handed} mode={m.mode} onDay={onDay} /> : <Foot days={tabel.days} missed={missed} mode={m.mode} />}
                    <span aria-hidden />
                    <span role="cell" className="rep-tabel-end">
                      <Totals row={{ submitted: foot.submitted, missed: foot.missed, excused: foot.excused, submit_rate: foot.rate }} excused={excused} as="foot" />
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          {days ? null : <Legend tabel={tabel} mode={m.mode} />}
        </>
      )}
      {tip.node}
    </section>
  );
}
