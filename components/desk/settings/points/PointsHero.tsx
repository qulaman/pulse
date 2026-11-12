"use client";

import { ChevronRight, Gift, Scale } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { LEDGER_LIMIT } from "@/components/desk/settings/points/LedgerTable";
import { TileFace } from "@/components/desk/team/TeamGrid";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { Bone } from "@/components/ui/Skeleton";
import { aqtobeDay, toAqtobeIso } from "@/lib/ai/time";
import { formatNum } from "@/lib/desk/format";
import { usePeople } from "@/lib/people/queries";
import { useRating } from "@/lib/points/queries";
import { useCompanyLedger, type LedgerRow } from "@/lib/shop/queries";
import { pluralRu } from "@/lib/tasks/status-text";

type Summary = { onHands: number; earned30: number; spent: number };

const DAYS = 30;
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"] as const;

/** The shop's own lines are not points given: a hold and its return only move points around. */
const SHOP = new Set(["shop_hold", "shop_release"]);

type Day = { day: number; label: string; given: number };

/** Fewer whole days than this on the ledger's page: no chart — a week is the least that says anything. */
const MIN_DAYS = 7;

/**
 * What the company gave by day, up to the last thirty days, from the ledger the screen reads anyway
 * (`useCompanyLedger`, the newest first). Only the days the page holds whole are drawn: a page cut
 * off in the middle of a day would draw a quiet start that never happened.
 */
function useGivenByDay(): Day[] | null {
  const ledger = useCompanyLedger(true, LEDGER_LIMIT);
  return useMemo(() => {
    if (!ledger.data) return null;
    const rows: LedgerRow[] = ledger.data;
    const today = aqtobeDay(new Date());
    const oldest = rows.at(-1);
    // a full page may end inside its oldest day: that day is not whole, the next one is the first
    const whole = rows.length < LEDGER_LIMIT || !oldest ? DAYS : Math.min(DAYS, today - aqtobeDay(new Date(oldest.created_at)));
    if (whole < MIN_DAYS) return null;
    const first = today - (whole - 1);
    const days: Day[] = Array.from({ length: whole }, (_, index) => {
      const iso = toAqtobeIso(new Date((first + index) * 86_400_000 + 12 * 3_600_000));
      return { day: first + index, label: `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`, given: 0 };
    });
    for (const row of rows) {
      if (row.amount <= 0 || SHOP.has(row.source)) continue;
      const at = aqtobeDay(new Date(row.created_at)) - first;
      if (at >= 0 && at < whole) days[at].given += row.amount;
    }
    return days;
  }, [ledger.data]);
}

/** The days of points given as bars that rise from the base, the last one — today — in full colour. */
function GivenChart({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => d.given));
  const any = days.some((d) => d.given > 0);
  return (
    <div className="pts-chart" aria-hidden>
      <div className="pts-chart-bars">
        {days.map((d, index) => (
          <span
            key={d.day}
            className="pts-chart-bar"
            data-today={index === days.length - 1 ? "" : undefined}
            data-zero={d.given === 0 ? "" : undefined}
            title={`${d.label}: ${d.given > 0 ? `+${formatNum(d.given)}` : "ничего"}`}
            style={{ height: `${d.given > 0 ? Math.max(8, (d.given / max) * 100) : 4}%`, animationDelay: `${index * 14}ms` }}
          />
        ))}
      </div>
      <div className="pts-chart-axis">
        <span>{days[0]?.label}</span>
        <span>{any ? `${days.length} ${pluralRu(days.length, ["день", "дня", "дней"])}` : `за ${days.length} ${pluralRu(days.length, ["день", "дня", "дней"])} очков не давали`}</span>
        <span>сегодня</span>
      </div>
    </div>
  );
}

/** The three of the week with the most points: their faces, the place on a badge, the points. */
function Leaders() {
  const week = useRating("week");
  const people = usePeople();
  const byId = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]);
  const top = (week.data ?? []).filter((row) => row.points > 0).slice(0, 3);
  if (week.isPending || people.isPending) {
    return (
      <div className="pts-leaders" aria-hidden>
        <Bone h={14} w={110} />
        <div className="mt-3 flex gap-4">
          {[0, 1, 2].map((i) => (
            <Bone key={i} round w={40} h={40} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="pts-leaders" data-testid="points-leaders">
      <p className="pts-hero-label">Лидеры недели</p>
      {top.length ? (
        <ol className="pts-leaders-list">
          {top.map((row, index) => {
            const person = byId.get(row.user_id);
            return (
              <li key={row.user_id} className="pts-leader" title={`${row.display_name}: +${formatNum(row.points)} за неделю`} style={{ animationDelay: `${120 + index * 70}ms` }}>
                <span className="pts-leader-face">
                  <TileFace person={person ?? { id: row.user_id, full_name: row.display_name, avatar_url: null }} size={40} />
                  <span className="pts-leader-place nums" data-place={index + 1}>
                    {index + 1}
                  </span>
                </span>
                <span className="pts-leader-name">{row.display_name.split(" ")[0]}</span>
                <span className="pts-leader-points nums">+{formatNum(row.points)}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-2 max-w-[200px] text-[13px] leading-[18px] text-muted">На этой неделе очков ещё никто не получил</p>
      )}
    </div>
  );
}

/**
 * The figure counts up from zero when the hero first shows, then rolls on every rise (RollingNumber:
 * a fall just changes; still under «уменьшить движение»).
 */
function Count({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <RollingNumber value={shown} className={className} />;
}

/**
 * The head of «Очки и магазин» (D-154, D-158, D-174) — the game's economy in one card: the points
 * the team holds, large; thirty days of what the company gave, by day; the three of the week with
 * their faces; under it the month's two totals and the two things that wait for the director —
 * orders to hand out and minuses people dispute — each a way into its section, lit while not zero.
 */
export function PointsHero({
  summary,
  waiting,
  disputes,
  onShop,
  onDisputes,
}: {
  summary: Summary | undefined;
  waiting: number;
  disputes: number;
  onShop: () => void;
  onDisputes: () => void;
}) {
  const days = useGivenByDay();
  const week = days && days.length >= 7 ? days.slice(-7).reduce((sum, d) => sum + d.given, 0) : null;
  return (
    <section className="desk-total pts-hero" aria-label="Сводка очков" data-testid="points-hero">
      <div className="pts-hero-main">
        <div className="pts-hero-total">
          <p className="pts-hero-label">На руках у команды</p>
          {summary ? (
            <p className="pts-hero-figure desk-figure nums" title={`${formatNum(summary.onHands)} ${pluralRu(Math.abs(summary.onHands), ["очко", "очка", "очков"])}`}>
              <Count value={summary.onHands} />
            </p>
          ) : (
            <Bone h={44} w={220} className="my-1" />
          )}
          <p className="text-[13px] leading-[18px] text-muted">{summary ? pluralRu(Math.abs(summary.onHands), ["очко", "очка", "очков"]) : "очков"} — сумма всех начислений и трат</p>
        </div>
        <div className="pts-hero-days">
          <p className="pts-hero-label">Роздано по дням</p>
          {days ? <GivenChart days={days} /> : <p className="mt-2 max-w-[260px] text-[13px] leading-[18px] text-muted">Очков за день так много, что история по дням не помещается — она во вкладке «История»</p>}
        </div>
        <Leaders />
      </div>
      <div className="pts-hero-foot">
        <div className="flex items-stretch" data-testid="points-hero-line">
          {/* the week only from whole days of the ledger's page, as the chart draws them */}
          {week !== null ? <Fact label="роздано за 7 дней" value={formatNum(week, { signed: true })} tone={week > 0 ? "gold" : undefined} /> : null}
          <Fact label="роздано за 30 дней" value={summary ? formatNum(summary.earned30, { signed: true }) : "—"} tone={summary && summary.earned30 > 0 ? "gold" : undefined} />
          <Fact label="унесено в магазин" value={summary ? formatNum(summary.spent) : "—"} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Waiting icon={<Gift size={16} strokeWidth={2} />} label="ждут выдачи" hint={waiting > 0 ? "выдать в магазине" : "выдавать нечего"} value={waiting} onClick={onShop} testId="points-hero-shop" />
          <Waiting icon={<Scale size={16} strokeWidth={2} />} label="оспаривают" hint={disputes > 0 ? "вернуть или оставить" : "споров нет"} value={disputes} onClick={onDisputes} testId="points-hero-disputes" />
        </div>
      </div>
    </section>
  );
}

/** A total of the month beside the hero's own. */
function Fact({ label, value, tone }: { label: string; value: string; tone?: "gold" }) {
  return (
    <span className="pts-fact">
      <span className="nums desk-figure pts-fact-value" style={tone ? { color: "var(--gold)" } : undefined}>
        {value}
      </span>
      <span className="pts-fact-label">{label}</span>
    </span>
  );
}

/** One thing waiting for the director: its count, lit while there is something; a click opens its section. */
function Waiting({ icon, label, hint, value, onClick, testId }: { icon: ReactNode; label: string; hint: string; value: number; onClick: () => void; testId: string }) {
  const on = value > 0;
  return (
    <button type="button" onClick={onClick} data-testid={testId} data-on={on ? "" : undefined} title={hint} className="pts-wait">
      <span aria-hidden className="pts-wait-icon">
        {icon}
      </span>
      <span className="nums pts-wait-value">{formatNum(value)}</span>
      <span className="pts-wait-label">{label}</span>
      <ChevronRight size={14} strokeWidth={2.25} aria-hidden className="pts-wait-arrow" />
    </button>
  );
}
