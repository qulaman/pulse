"use client";

import { ChevronRight, Scale } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { LEDGER_LIMIT } from "@/components/desk/points/LedgerTable";
import { Face } from "@/components/desk/ui/Face";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { Bone } from "@/components/ui/Skeleton";
import { aqtobeDay, toAqtobeIso } from "@/lib/ai/time";
import { formatNum } from "@/lib/desk/format";
import { usePeople } from "@/lib/people/queries";
import { useRating, type RatingPeriod } from "@/lib/points/queries";
import type { Hands } from "@/lib/shop/hands";
import { useCompanyLedger, type LedgerRow } from "@/lib/shop/queries";
import { pluralRu } from "@/lib/tasks/status-text";

type Summary = { earned30: number; spent: number };

const POINTS = (value: number) => pluralRu(Math.abs(value), ["очко", "очка", "очков"]);

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

const NOBODY: Record<RatingPeriod, string> = {
  week: "На этой неделе очков ещё никто не получил",
  month: "В этом месяце очков ещё никто не получил",
  all: "Очков ещё никто не получил",
};

/**
 * The period's first three as a podium (D-215): the leader in the middle and highest, the second on
 * the left, the third on the right — a face, a name, the points, and the step with the place. Only
 * people with points stand here; one or two stand without a hole for the missing. A face leads to
 * the person's card.
 */
function Podium({ period }: { period: RatingPeriod }) {
  const rating = useRating(period);
  const people = usePeople();
  const byId = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p])), [people.data]);
  const top = (rating.data ?? []).filter((row) => row.points > 0).slice(0, 3);
  if (rating.isPending || people.isPending) {
    return (
      <div className="rate-podium" aria-hidden>
        {[44, 56, 44].map((size, i) => (
          <Bone key={i} round w={size} h={size} />
        ))}
      </div>
    );
  }
  if (top.length === 0) return <p className="rate-podium-none">{NOBODY[period]}</p>;
  // the order on the floor: 2nd, 1st, 3rd
  const order = top.length === 1 ? top : top.length === 2 ? [top[1], top[0]] : [top[1], top[0], top[2]];
  return (
    <ol className="rate-podium" data-testid="rating-podium">
      {order.map((row) => {
        const place = top.indexOf(row) + 1;
        const person = byId.get(row.user_id);
        return (
          <li key={row.user_id} className="rate-step" data-place={place}>
            <Link href={`/desk/team/${row.user_id}`} prefetch={false} className="rate-step-who desk-focus" title={`${row.display_name}: +${formatNum(row.points)}`}>
              <Face person={person ?? { id: row.user_id, full_name: row.display_name, avatar_url: null }} size={place === 1 ? 56 : 44} />
              <span className="rate-step-name">{row.display_name.split(" ")[0]}</span>
              <span className="rate-step-points nums">+{formatNum(row.points)}</span>
            </Link>
            <span className="rate-step-block nums" aria-label={`${place} место`}>
              {place}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The figure counts up from zero when the hero first shows, then rolls on every rise (RollingNumber:
 * a fall just changes).
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
 * The head of «Рейтинг» (D-215): who leads — the period's podium — beside what the company gave by
 * day over thirty days, the two totals of giving, and the one thing of the rating that waits for
 * the director: minuses people dispute.
 */
export function RatingHero({ period, summary, disputes, onDisputes }: { period: RatingPeriod; summary: Summary | undefined; disputes: number; onDisputes: () => void }) {
  const days = useGivenByDay();
  const week = days && days.length >= 7 ? days.slice(-7).reduce((sum, d) => sum + d.given, 0) : null;
  return (
    <section className="desk-total pts-hero rate-hero" aria-label="Лидеры и розданные очки" data-testid="rating-hero">
      <div className="rate-hero-leaders">
        <p className="pts-hero-label">{LEADERS[period]}</p>
        <Podium period={period} />
      </div>
      <div className="rate-hero-given">
        <p className="pts-hero-label">Роздано по дням</p>
        {days ? <GivenChart days={days} /> : <p className="mt-2 max-w-[260px] text-[13px] leading-[18px] text-muted">Очков за день так много, что история по дням не помещается</p>}
        <div className="pts-hero-foot">
          <div className="flex items-stretch" data-testid="points-hero-line">
            {/* the week only from whole days of the ledger's page, as the chart draws them */}
            {week !== null ? <Fact label="роздано за 7 дней" value={formatNum(week, { signed: true })} tone={week > 0 ? "gold" : undefined} /> : null}
            <Fact label="роздано за 30 дней" value={summary ? formatNum(summary.earned30, { signed: true }) : "—"} tone={summary && summary.earned30 > 0 ? "gold" : undefined} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Waiting icon={<Scale size={16} />} label="оспаривают" hint={disputes > 0 ? "вернуть или оставить" : "споров нет"} value={disputes} onClick={onDisputes} testId="points-hero-disputes" />
          </div>
        </div>
      </div>
    </section>
  );
}

const LEADERS: Record<RatingPeriod, string> = { week: "Лидеры недели", month: "Лидеры месяца", all: "Лидеры за всё время" };

/**
 * The head of «Магазин» (D-215): what waits to be handed out — the director's own move, large and
 * lit while there is something — beside the points the team holds and can bring here, and what
 * has already been carried away.
 */
export function ShopHero({ summary, hands, waiting, onQueue }: { summary: Summary | undefined; hands: Hands | undefined; waiting: number; onQueue: () => void }) {
  return (
    <section className="desk-total pts-hero shop-hero" aria-label="Сводка магазина" data-testid="shop-hero">
      <button type="button" className="shop-hero-queue desk-focus" data-on={waiting > 0 ? "" : undefined} onClick={onQueue} data-testid="points-hero-shop">
        <span className="pts-hero-label">Ждут выдачи</span>
        <span className="pts-hero-figure desk-figure nums">
          <Count value={waiting} />
        </span>
        <span className="shop-hero-note">{waiting > 0 ? `${pluralRu(waiting, ["заказ", "заказа", "заказов"])} — очки уже придержаны` : "выдавать нечего"}</span>
      </button>
      <div className="pts-hero-total">
        <p className="pts-hero-label">На руках у команды</p>
        {hands ? (
          <p className="pts-hero-figure desk-figure nums" title={`${formatNum(hands.team)} ${POINTS(hands.team)}`} data-testid="points-hero-hands">
            <Count value={hands.team} />
          </p>
        ) : (
          <Bone h={44} w={220} className="my-1" />
        )}
        {/* the figure is the sum of the team's balances; points of who left stay theirs and are said apart */}
        <p className="text-[13px] leading-[18px] text-muted">{hands ? POINTS(hands.team) : "очков"} — их могут принести в магазин</p>
        {hands && hands.gone !== 0 ? (
          <p className="nums text-[13px] leading-[18px] text-muted" data-testid="points-hero-gone">
            ещё {formatNum(hands.gone)} — у ушедших
          </p>
        ) : null}
        {hands && hands.other !== 0 ? <p className="nums text-[13px] leading-[18px] text-muted">ещё {formatNum(hands.other)} — у директора и экрана</p> : null}
      </div>
      <div className="shop-hero-facts">
        <Fact label="унесено в магазин" value={summary ? formatNum(summary.spent) : "—"} />
        <Fact label="роздано за 30 дней" value={summary ? formatNum(summary.earned30, { signed: true }) : "—"} tone={summary && summary.earned30 > 0 ? "gold" : undefined} />
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
      <ChevronRight size={14} aria-hidden className="pts-wait-arrow" />
    </button>
  );
}
