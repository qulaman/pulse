"use client";

import { useEffect, useRef, useState } from "react";

import { PointsLine } from "@/components/HeaderPoints";
import { PointsFlight } from "@/components/pulse/PointsFlight";
import { RatingRowLine } from "@/components/rating/RatingList";
import { Button } from "@/components/ui/Button";
import { RollingNumber } from "@/components/ui/RollingNumber";
import type { RatingRow } from "@/lib/points/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/**
 * Component sandbox (D-165): points as a scoreboard and «+N» into the counter, with no points given
 * to anyone — nothing here reads or writes the database. «+5» shows the pill under the face as Лента
 * does and sends its copy into the counter in the header; the balance comes a moment later, as the
 * refetch after the realtime row does, and rolls up. «−10» changes at once, standing still (D-45).
 * «Заказ −30» rolls the shop's balance down; the header, which never rolls down, just changes.
 * «Шапка без очков» takes the counter away, as in a secretary's header: then nothing flies.
 */

const START = 120;
/** The real balance comes after the realtime row: a refetch of `point_balances`. */
const REFETCH_MS = 300;
/** As Лента's `PILL_MS`. */
const PILL_MS = 4_000;

const ROW: RatingRow = { user_id: "me", display_name: "Ерлан Бекетов", points: 85, rank: 2, delta_vs_prev: 0, on_time_pct: 92, is_me: true };

export default function PointsSandbox() {
  const [balance, setBalance] = useState(START);
  const [rated, setRated] = useState(ROW.points);
  const [ordered, setOrdered] = useState(false);
  // a header with no points, as a secretary's: nothing to fly into, nothing flies
  const [bare, setBare] = useState(false);
  const [arrival, setArrival] = useState(0);
  const [pill, setPill] = useState<{ key: number; text: string } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);
  const later = (ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms));
  };

  const award = (amount: number) => {
    const key = arrival + 1;
    setArrival(key);
    setPill({ key, text: `+${amount} ${pluralRu(amount, ["очко", "очка", "очков"])}` });
    later(PILL_MS, () => setPill((current) => (current?.key === key ? null : current)));
    later(REFETCH_MS, () => {
      setOrdered(false);
      setBalance((value) => value + amount);
      setRated((value) => value + amount);
    });
  };
  const penalty = (amount: number) =>
    later(REFETCH_MS, () => {
      setOrdered(false);
      setBalance((value) => value - amount);
      setRated((value) => value - amount);
    });
  // a hold: the balance drops, what was earned (the rating) does not
  const order = (price: number) => {
    setOrdered(true);
    later(REFETCH_MS, () => setBalance((value) => value - price));
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col" data-testid="points-sandbox">
      {/* the header of Лента: the name and the points under it, as AppHeader draws them */}
      <header className="px-4" style={{ paddingTop: 8, paddingBottom: 8 }}>
        <div className="flex items-center justify-between gap-3">
          <span className="truncate font-display text-[17px] font-bold leading-[22px] tracking-[-0.02em]">Песочница очков</span>
          <span className="flex min-w-0 shrink-0 items-center gap-2">
            <span className="flex min-w-0 flex-col items-end">
              <span className="max-w-[110px] truncate text-[13px] leading-4 text-muted">Ерлан</span>
              {bare ? null : <PointsLine points={balance} />}
            </span>
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-bg"
              style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
            >
              ЕБ
            </span>
          </span>
        </div>
      </header>

      {/* where the face rests in Лента, and the pill right under it, as Лента draws it */}
      <div className="flex h-[240px] items-end justify-center pb-3">
        <span className="text-[13px] leading-4 text-muted">здесь лицо</span>
      </div>
      <div className="flex h-8 shrink-0 justify-center">
        {pill ? (
          <div className="flex shrink-0 justify-center" data-testid="face-pill">
            <span
              key={pill.key}
              className="card-in nums rounded-full px-3 py-1 text-[14px] font-semibold leading-5"
              style={{ background: "color-mix(in srgb, var(--gold) 18%, var(--surface))", color: "var(--gold)" }}
            >
              {pill.text}
            </span>
          </div>
        ) : null}
        <PointsFlight arrival={arrival} />
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2 px-4">
        <Button variant="secondary" onClick={() => award(5)} data-testid="award-5">
          +5
        </Button>
        <Button variant="secondary" onClick={() => penalty(10)} data-testid="penalty-10">
          −10
        </Button>
        <Button variant="secondary" onClick={() => order(30)} data-testid="order-30">
          Заказ −30 (магазин)
        </Button>
        <Button variant="ghost" onClick={() => setBare((value) => !value)} data-testid="bare-header">
          {bare ? "Вернуть очки в шапку" : "Шапка без очков"}
        </Button>
      </div>

      <div className="mt-6 px-4">
        <p className="eyebrow px-1">Рейтинг</p>
        <ul className="mt-2 flex flex-col gap-2">
          <RatingRowLine row={{ ...ROW, points: rated }} streak={0} canAward={false} onAward={() => {}} onOpen={() => {}} />
        </ul>
      </div>

      {/* the balance of the shop, as ShopFront draws it: one's own order rolls it down */}
      <section className="card mx-4 mt-6 flex items-center gap-4 px-4 py-3.5">
        <div className="min-w-0">
          <p className="eyebrow">Очки</p>
          <p data-testid="shop-balance" className="nums mt-0.5 text-[40px] font-bold leading-[44px]" style={{ color: "var(--gold)" }}>
            <RollingNumber value={balance} rollDown={ordered} />
          </p>
          <p className="mt-0.5 text-[13px] leading-4 text-muted">Магазин</p>
        </div>
      </section>
    </div>
  );
}
