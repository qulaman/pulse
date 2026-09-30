"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "framer-motion";

import type { TickerItem, TickerTone } from "@/lib/tv/ticker";
import {
  tapeCopies,
  tapeKey,
  tapeLoop,
  tapeOf,
  tapeOffset,
  tapeRephase,
  tapeSettle,
  tapeSplice,
  type Tape,
  type TapeGeometry,
  type TapeSpan,
} from "@/lib/tv/tickerTape";

import styles from "./tv.module.css";

/**
 * Бегущая строка над лицом: всё, что происходит в компании, едет одной лентой справа
 * налево. Экран смотрят издалека и мельком, поэтому строка одна, крупная и без рамки.
 *
 * Строка едет на композиторе (D-45, D-121): CSS-анимация сдвигает дорожку из копий ленты
 * на ширину одной копии и начинает заново — в момент возврата на месте первой копии стоит
 * следующая, шва не видно. React в кадрах не участвует: длину круга и его время он ставит
 * переменными один раз, когда лента меняется. Скорость постоянная и в vh: короткий день
 * не летит, длинный не ползёт, а 4K и ноутбук читаются в том же темпе, что 1080p.
 *
 * Новые слова не дёргают ленту: то, что на экране, доезжает как было, а новое въезжает
 * справа, когда до него дойдёт очередь (`tapeSplice` → `tapeSettle`, lib/tv/tickerTape.ts).
 */

/** 90 px/с на стене 1080p — комфортная скорость чтения с нескольких метров, — в vh/с. */
const SPEED_VH_S = 90 / 10.8;
/** Как часто дорожка проверяет, не пора ли взять новые слова или убрать вход. */
const TICK_MS = 250;

const COLOR: Record<TickerTone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  gold: "var(--gold)",
  muted: "var(--text-muted)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

const mod = (value: number, by: number) => (by > 0 ? ((value % by) + by) % by : 0);

/** Что стоит на дорожке сейчас: лента, её замер, скорость и ширина окна. */
type Placed = { tape: Tape; geo: TapeGeometry; speed: number; view: number };

function Item({ item }: { item: TickerItem }) {
  return (
    <span className="flex shrink-0 items-center" data-tape-id={item.id}>
      <span aria-hidden className="mx-[2.4vh] h-[1vh] w-[1vh] shrink-0 rounded-full" style={{ background: COLOR[item.tone] }} />
      <span className="whitespace-nowrap text-[3.2vh] leading-[4.2vh]" style={{ color: item.tone === "muted" ? "var(--text-muted)" : "var(--text)" }}>
        {item.text}
      </span>
    </span>
  );
}

/** Одна копия ленты. Вторая и дальше — те же слова: экранный диктор читает ленту один раз. */
const Run = memo(function Run({ items, runRef, echo }: { items: TickerItem[]; runRef?: RefObject<HTMLDivElement | null>; echo: boolean }) {
  return (
    <div ref={runRef} className="flex shrink-0 items-center" aria-hidden={echo || undefined}>
      {items.map((item) => (
        <Item key={item.id} item={item} />
      ))}
    </div>
  );
});

/**
 * `paused` — the wall sleeps (D-96, D-105): the row fades out and the tape stops where it stands; nobody sees
 * it, and in the morning it rolls on from there.
 */
export function TvTicker({ items, paused = false }: { items: TickerItem[]; paused?: boolean }) {
  const reduced = useReducedMotion() ?? false;
  const [tape, setTape] = useState(() => tapeOf(items));
  // one run's width and the window's, from the ResizeObserver: how many copies the track needs
  const [room, setRoom] = useState({ run: 0, view: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<HTMLDivElement>(null);
  const placed = useRef<Placed | null>(null);
  const latest = useRef(items);
  // new words to take in, or the lead of the last change still to roll away
  const busy = tapeKey(items) !== tapeKey(tape.source) || tape.lead.length > 0;
  const empty = tape.run.length === 0;
  const copies = tapeCopies(room.run, room.view);

  useEffect(() => {
    latest.current = items;
  });

  // a new tape or a new room: measure it and hand the compositor its loop, carrying on from
  // where the screen stands — all before the frame is painted
  useLayoutEffect(() => {
    const track = trackRef.current;
    const run = runRef.current;
    const box = boxRef.current;
    if (!track || !run || !box) {
      placed.current = null;
      return;
    }
    const geo = measure(leadRef.current, run);
    const view = box.getBoundingClientRect().width;
    const speed = (SPEED_VH_S * window.innerHeight) / 100;
    const before = placed.current;
    if (before && before.tape === tape && before.speed === speed && sameGeometry(before.geo, geo)) {
      // only the window changed (a wider screen, more copies): the tape runs on untouched
      placed.current = { ...before, view };
      return;
    }
    const loop = tapeLoop(geo);
    const moving = tapeAnimation(track);
    let offset = 0;
    if (before && moving) {
      const x = tapeOffset(timeOf(moving), before.speed, tapeLoop(before.geo));
      // another tape knows where it began on the old track; the same tape re-measured keeps its left edge
      offset = before.tape !== tape ? (tape.shift === undefined ? 0 : mod(x - tape.shift, loop)) : tapeRephase(before.geo, x, before.view, geo);
    }
    track.style.setProperty("--tape-shift", `${-loop}px`);
    track.style.setProperty("--tape-time", `${loop / speed}s`);
    // getAnimations() flushes the new loop first; the time lands in the same frame as the words
    const animation = tapeAnimation(track);
    if (animation) animation.currentTime = (offset / speed) * 1000;
    placed.current = { tape, geo, speed, view };
  }, [tape, room]);

  // fonts arriving, a resized window: the run and the window change size without new words
  useEffect(() => {
    const box = boxRef.current;
    const run = runRef.current;
    if (empty || !box || !run) return;
    const observer = new ResizeObserver(() => {
      const next = { run: run.getBoundingClientRect().width, view: box.getBoundingClientRect().width };
      setRoom((prev) => (Math.abs(prev.run - next.run) < 0.5 && Math.abs(prev.view - next.view) < 0.5 ? prev : next));
    });
    observer.observe(box);
    observer.observe(run);
    return () => observer.disconnect();
  }, [empty]);

  // new words go in at once behind what is on screen; the lead rolls away, then the track is plain copies again
  useEffect(() => {
    if (!busy) return;
    const tick = () => {
      const next = latest.current;
      const now = placed.current;
      const animation = trackRef.current ? tapeAnimation(trackRef.current) : null;
      if (reduced || !now || !animation) {
        setTape(tapeOf(next));
        return;
      }
      const x = tapeOffset(timeOf(animation), now.speed, tapeLoop(now.geo));
      const margin = Math.max(24, now.view * 0.02);
      if (tapeKey(next) !== tapeKey(now.tape.source)) {
        setTape(tapeSplice(now.tape, now.geo, x, now.view, next, margin));
        return;
      }
      const settled = tapeSettle(now.tape, now.geo, x, margin);
      if (settled) setTape(settled);
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [busy, reduced]);

  if (empty) return null;

  return (
    <div
      ref={boxRef}
      className="relative w-full overflow-hidden py-[1vh]"
      aria-live="off"
      // края растворяются, а не обрезаются: строка выезжает из ничего и уходит в ничто
      style={{
        maskImage: "linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent)",
      }}
    >
      <div
        ref={trackRef}
        className={`flex w-max items-center ${styles.tape}`}
        style={paused ? { animationPlayState: "paused" } : undefined}
        data-testid="tv-ticker"
        data-copies={copies}
      >
        {tape.lead.length > 0 ? (
          // what was on screen when the words changed: it rolls on as it was, once
          <div ref={leadRef} className="flex shrink-0 items-center" aria-hidden>
            {tape.lead.map((item, index) => (
              <Item key={`${index}:${item.id}`} item={item} />
            ))}
          </div>
        ) : null}
        {Array.from({ length: copies }, (_, copy) => (
          <Run key={copy} items={tape.run} runRef={copy === 0 ? runRef : undefined} echo={copy > 0} />
        ))}
      </div>
    </div>
  );
}

/** Items where they stand: the lead from the track's start, the run from its own; a transform moves both alike. */
function measure(lead: HTMLElement | null, run: HTMLElement): TapeGeometry {
  const spans = (row: HTMLElement): TapeSpan[] => {
    const box = row.getBoundingClientRect();
    return Array.from(row.children, (node) => {
      const rect = node.getBoundingClientRect();
      return { id: node instanceof HTMLElement ? (node.dataset.tapeId ?? "") : "", left: rect.left - box.left, width: rect.width };
    });
  };
  return {
    lead: lead ? spans(lead) : [],
    leadWidth: lead ? lead.getBoundingClientRect().width : 0,
    run: run.getBoundingClientRect().width,
    spans: spans(run),
  };
}

function sameGeometry(a: TapeGeometry, b: TapeGeometry): boolean {
  const near = (x: number, y: number) => Math.abs(x - y) < 0.5;
  const sameSpans = (p: TapeSpan[], q: TapeSpan[]) => p.length === q.length && p.every((span, i) => span.id === q[i].id && near(span.left, q[i].left));
  return near(a.run, b.run) && near(a.leadWidth, b.leadWidth) && sameSpans(a.spans, b.spans) && sameSpans(a.lead, b.lead);
}

/** The tape's own CSS animation — none under reduced motion. */
function tapeAnimation(track: HTMLElement): Animation | null {
  return track.getAnimations().find((animation) => "animationName" in animation) ?? null;
}

function timeOf(animation: Animation): number {
  const time = animation.currentTime;
  return typeof time === "number" ? time : 0;
}
