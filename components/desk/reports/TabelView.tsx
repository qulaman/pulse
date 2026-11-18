"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { isoWeekday, rangeText } from "@/lib/daily-report/format";
import { cellSymbol, cellWords, holidayWords, missedByDay, tabelPeriodWords, tabelTotals } from "@/lib/daily-report/tabel";
import type { TeamPeriodRow } from "@/lib/daily-report/types";
import { parseYmd, WEEKDAYS_SHORT_RU, type Ymd } from "@/lib/datetime/calendar";

import { TileFace } from "../team/TeamGrid";
import type { Tabel, TabelDay, TabelPerson } from "./tabel-data";

export type TabelShow = "all" | "gaps";

export type TabelViewProps = {
  tabel: Tabel | undefined;
  stale: boolean;
  failed: boolean;
  onRetry: () => void;
  match: (row: Pick<TeamPeriodRow, "full_name" | "position">) => boolean;
  show: TabelShow;
  onShow: (show: TabelShow) => void;
  selectedId: string | null;
  openId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string | null) => void;
  /** A day's head: open «День» on it. */
  onDay: (day: Ymd) => void;
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
const MARK_MAX = 64;
const DENSE_MIN = 13;
/** The totals' widths — reports-tabel.css `.rep-tabel-totals [data-col]` says the same. */
const TOTAL_W = { submitted: 44, missed: 58, excused: 48, rate: 50 } as const;

type Mode = "marks" | "dense";

function measures(width: number, days: number, excused: boolean) {
  const name = width > 0 && width < 920 ? NAME_W_NARROW : NAME_W;
  const totals = TOTAL_W.submitted + TOTAL_W.missed + TOTAL_W.rate + (excused ? TOTAL_W.excused : 0);
  const room = width - name - totals - 2;
  const mode: Mode = width === 0 || room / Math.max(1, days) >= MARK_MIN ? "marks" : "dense";
  const [min, max] = mode === "marks" ? [MARK_MIN, MARK_MAX] : [DENSE_MIN, 40];
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
const weekday = (day: Ymd) => WEEKDAYS_SHORT_RU[isoWeekday(day) - 1];
/** «ср, 12 нояб.» */
const dayLabel = (day: Ymd) => `${weekday(day)}, ${rangeText(day, day)}`;
const percent = (rate: number) => `${Math.round(rate * 100)} %`;
const SHORT_MONTHS = ["янв.", "февр.", "март", "апр.", "май", "июнь", "июль", "авг.", "сент.", "окт.", "нояб.", "дек."] as const;

/** The one line over the sheet instead of a hero: «Ноябрь 2026 · сдано 87 % · пропусков 14 · уважительных 2». */
function SumLine({ tabel }: { tabel: Tabel }) {
  const t = tabel.totals;
  return (
    <p className="rep-tabel-sum nums" data-testid="desk-tabel-total">
      <span className="rep-tabel-sum-period">{capital(tabelPeriodWords(tabel.from, tabel.to))}</span>
      {t.rate === null ? (
        <span>отчётов ещё не ждали</span>
      ) : (
        <>
          <span>
            сдано <b>{percent(t.rate)}</b>
          </span>
          {t.missed > 0 ? (
            <span data-tone="danger">
              пропусков <b>{t.missed}</b>
            </span>
          ) : (
            <span>без пропусков</span>
          )}
          {t.excused > 0 ? (
            <span>
              уважительных <b>{t.excused}</b>
            </span>
          ) : null}
        </>
      )}
    </p>
  );
}

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

const Row = memo(function Row({ person, days, mode, excused, selected, open, onSelect, onOpen }: RowProps) {
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
          <TileFace person={{ id, full_name: person.row.full_name, avatar_url: person.row.avatar_url }} size={mode === "dense" ? 18 : 20} />
          <span className="rep-tabel-name-text">{person.row.full_name}</span>
        </button>
      </span>
      {person.cells.map((cell, index) => (
        <span key={cell.day} role="cell" className="rep-tabel-cell" data-i={index} data-state={cell.state} data-testid="desk-tabel-cell" {...dayAttrs(days[index], index)}>
          <span className="rep-tabel-mark">{mode === "marks" ? cellSymbol(cell) : null}</span>
        </span>
      ))}
      <span aria-hidden className="rep-tabel-gap" />
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
function useSheetTip(tabel: Tabel | undefined, shown: readonly TabelPerson[]) {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const byId = useMemo(() => new Map(shown.map((person) => [person.row.user_id, person])), [shown]);
  const missed = useMemo(() => (tabel ? missedByDay(shown, tabel.days.length) : []), [tabel, shown]);

  const textOf = (target: HTMLElement): string | null => {
    if (!tabel) return null;
    const cell = target.closest<HTMLElement>("[data-i], [data-head], [data-foot], [data-tip]");
    if (!cell) return null;
    if (cell.dataset.head !== undefined || cell.dataset.foot !== undefined) {
      const index = Number(cell.dataset.head ?? cell.dataset.foot);
      const day = tabel.days[index];
      if (!day) return null;
      const extra = day.holiday ? holidayWords(day.day) : day.weekend ? "выходной" : day.future ? "ещё впереди" : `не сдали ${missed[index] ?? 0}`;
      return `${capital(dayLabel(day.day))} · ${extra}${cell.dataset.head !== undefined && !day.future ? " — открыть день" : ""}`;
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
    const box = (target.closest("[data-i], [data-head], [data-foot], [data-tip]") as HTMLElement).getBoundingClientRect();
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
            className="rep-tabel-tip pointer-events-none fixed z-[80] whitespace-nowrap rounded-[8px] border border-border bg-surface-2 px-2 py-1 text-[12px] leading-4 text-text"
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
              aria-label={`${capital(dayLabel(day.day))} — открыть день`}
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
      <span className="rep-tabel-legend-hint">По дню — «День», по имени — дневник</span>
    </div>
  );
}

function TabelBone() {
  return (
    <SkeletonGroup grow className="rep-tabel-bone">
      <div className="flex h-9 items-center justify-between">
        <Bone h={16} w={340} />
        <Bone h={32} w={236} />
      </div>
      <div className="rep-tabel-bone-sheet">
        <Bone h={36} />
        {Array.from({ length: 9 }, (_, index) => (
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
 * «Отчёты → Табель» on the desk (D-183): the period as people × days — a mark a day (✓ сдан, ✕ не
 * сдан, у уважительная, о/б away), weekends dimmed, holidays hatched, today outlined; the totals on
 * the right, the misses of each day at the bottom; never hours, never points. A day's head opens
 * «День» on it, a name the person's diary, a row is chosen by a click (↑/↓ on the page). A quarter
 * turns into colour only and scrolls sideways under the names. One line over it says the period.
 */
export function TabelView({ tabel, stale, failed, onRetry, match, show, onShow, selectedId, openId, onSelect, onOpen, onDay }: TabelViewProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const hasSheet = Boolean(tabel && tabel.people.length > 0);
  // the sheet's width decides marks or colour; its top, how tall it may be to end at the window's
  // edge with the legend under it — measured before the first paint, followed after
  useLayoutEffect(() => {
    const node = sheet.current;
    if (!node) return;
    const place = () => {
      const main = node.closest<HTMLElement>("#desk-main");
      const legend = node.parentElement?.querySelector<HTMLElement>(".rep-tabel-legend");
      const top = node.getBoundingClientRect().top + (main?.scrollTop ?? 0);
      // the gap, the legend, the page's own bottom margin
      node.style.setProperty("--rep-tabel-top", `${Math.round(top + 12 + (legend?.offsetHeight ?? 16) + 44)}px`);
    };
    setWidth(node.clientWidth);
    place();
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
      place();
    });
    observer.observe(node);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [hasSheet]);

  const matched = useMemo(() => (tabel ? tabel.people.filter((person) => match(person.row)) : []), [tabel, match]);
  const shown = useMemo(() => (show === "gaps" ? matched.filter((person) => person.row.missed > 0) : matched), [matched, show]);
  const tip = useSheetTip(tabel, shown);

  // a person chosen by the keys comes into view under the sticky head
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
      <div data-testid="desk-tabel">
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
        <TabelBone />
      </div>
    );
  }

  const excused = tabel.people.some((person) => (person.row.excused ?? 0) > 0);
  const m = measures(width, tabel.days.length, excused);
  const missed = missedByDay(shown, tabel.days.length);
  const foot = tabelTotals(shown);
  const gaps = tabel.people.filter((person) => person.row.missed > 0).length;

  return (
    <div className="rep-tabel" data-testid="desk-tabel" data-stale={stale ? "" : undefined} aria-busy={stale || undefined}>
      <div className="rep-tabel-bar">
        <SumLine tabel={tabel} />
        <SegmentTabs<TabelShow>
          aria-label="Кого показать"
          value={show}
          onChange={onShow}
          items={[
            { value: "all", label: "Все", count: tabel.people.length },
            { value: "gaps", label: "С пропусками", count: gaps },
          ]}
        />
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
            <div role="table" aria-label={`Табель отчётов, ${tabelPeriodWords(tabel.from, tabel.to)}`} aria-rowcount={shown.length + 2} className="rep-tabel-grid">
              <div role="rowgroup" className="rep-tabel-head">
                {m.mode === "dense" ? (
                  <div className="rep-tabel-row rep-tabel-months" aria-hidden>
                    <span className="rep-tabel-name rep-tabel-corner" />
                    <MonthLabels days={tabel.days} />
                    <span className="rep-tabel-gap" />
                    <span className="rep-tabel-end" />
                  </div>
                ) : null}
                <div role="row" className="rep-tabel-row rep-tabel-heads">
                  <span role="columnheader" className="rep-tabel-name rep-tabel-corner">
                    Сотрудник
                  </span>
                  <DayHeads days={tabel.days} mode={m.mode} onDay={onDay} />
                  <span aria-hidden className="rep-tabel-gap" />
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
                {shown.map((person) => (
                  <Row
                    key={person.row.user_id}
                    person={person}
                    days={tabel.days}
                    mode={m.mode}
                    excused={excused}
                    selected={person.row.user_id === selectedId}
                    open={person.row.user_id === openId}
                    onSelect={onSelect}
                    onOpen={onOpen}
                  />
                ))}
                {shown.length === 0 ? (
                  <p className="rep-tabel-none">
                    {matched.length === 0 ? "Никого не нашлось" : "За этот период без пропусков — все сдали"}
                    {show === "gaps" ? (
                      <Button size="sm" variant="ghost" onClick={() => onShow("all")}>
                        Показать всех
                      </Button>
                    ) : null}
                  </p>
                ) : null}
              </div>

              <div role="rowgroup" className="rep-tabel-foot" data-testid="desk-tabel-foot">
                <div role="row" className="rep-tabel-row">
                  <span role="rowheader" className="rep-tabel-name rep-tabel-corner">
                    Не сдали
                  </span>
                  <Foot days={tabel.days} missed={missed} mode={m.mode} />
                  <span aria-hidden className="rep-tabel-gap" />
                  <span role="cell" className="rep-tabel-end">
                    <Totals row={{ submitted: foot.submitted, missed: foot.missed, excused: foot.excused, submit_rate: foot.rate }} excused={excused} as="foot" />
                  </span>
                </div>
              </div>
            </div>
          </div>
          <Legend tabel={tabel} mode={m.mode} />
        </>
      )}
      {tip.node}
    </div>
  );
}
