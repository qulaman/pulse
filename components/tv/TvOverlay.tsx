"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { markRung, playChime, rungBefore } from "@/lib/tv/chime";
import type { OverlayBanner, OverlayView } from "@/lib/tv/overlay";

import s from "./tv.module.css";

/**
 * Слой «важно сейчас» поверх стены (D-96): посетитель у стола секретаря, сообщение секретаря
 * (D-116) и мероприятие, которое вот-вот начнётся. Звонок — один раз на визит и на сообщение.
 *
 * Два вида (D-182):
 *  - **поверх заставки** — крупно посреди стены на непрозрачной подложке: яркое лицо сквозь
 *    полупрозрачную подложку спорило с текстом. Подпись с часами стоит над подложкой (TvFrame).
 *    Сцена под ней остаётся смонтированной и не рисуется, пока подложка закрывает её целиком;
 *  - **над доской, человеком, делом и объявлением** — полосой в нижней трети: то, что читает
 *    комната, остаётся на стене.
 *
 * Слова проявляются, когда подложка набрала около 70 %: раньше текст и сцена под ним шли
 * двойной экспозицией. «Подождёт» — не надпись, а тихая плашка в углу: ответ дан, человек ждёт.
 * Движение — только opacity и transform (перф-контракт D-45).
 */

const EASE = [0.2, 0, 0, 1] as const;
/** The backdrop fades in evenly; its words wait till it is about 70 % there. */
const BACKDROP_S = 0.36;
const WORDS_AFTER_S = 0.25;

/** A short message is read from across the room; a long one still fits in four lines. */
const SHORT_MESSAGE = 40;

export type OverlayMode = "cover" | "band";

export function TvOverlay({
  view,
  sound,
  mode = "cover",
  onCovered,
}: {
  view: OverlayView;
  sound: boolean;
  /** `band` — a person, an order, a board or an announcement is on the wall: the notice keeps to the bottom third. */
  mode?: OverlayMode;
  onCovered?: () => void;
}) {
  const shown = view.banner;

  // one ring per visitor or message, and not again after the kiosk restarts
  const ringId = shown?.kind === "visit" || shown?.kind === "message" ? shown.id : null;
  useEffect(() => {
    if (!ringId || !sound || rungBefore(ringId)) return;
    markRung(ringId);
    playChime();
  }, [ringId, sound]);

  return (
    <>
      <AnimatePresence>
        {shown && mode === "cover" ? (
          // one backdrop while any notice is up: a visitor after a message, the next message after
          // «Понятно» change the words on it, and the scene underneath never shows through
          <motion.div
            key="cover"
            className="absolute inset-0 z-30 flex items-center justify-center px-[6vh] pb-[10vh]"
            style={{ background: "var(--bg)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.35 } }}
            transition={{ duration: BACKDROP_S, ease: "linear" }}
            // fully opaque: the wall under it need not be drawn (TvFrame)
            onAnimationComplete={(target) => {
              if (typeof target === "object" && target !== null && "opacity" in target && target.opacity === 1) onCovered?.();
            }}
            data-testid="tv-overlay"
            data-kind={shown.kind}
            data-mode="cover"
          >
            <Words banner={shown} band={false} />
          </motion.div>
        ) : null}
        {shown && mode === "band" ? (
          <motion.div
            key="band"
            className="absolute -inset-x-[1vh] z-30 flex items-center px-[7vh] py-[2.6vh]"
            style={{
              bottom: "calc(4vh + 8vh * var(--tv-k, 1))",
              background: "color-mix(in srgb, var(--surface) 96%, var(--bg))",
              borderBlock: "0.2vh solid color-mix(in srgb, var(--accent) 40%, var(--border))",
            }}
            initial={{ opacity: 0, y: "3vh" }}
            animate={{ opacity: 1, y: "0vh" }}
            exit={{ opacity: 0, y: "2vh", transition: { duration: 0.3 } }}
            transition={{ duration: BACKDROP_S, ease: EASE }}
            data-testid="tv-overlay"
            data-kind={shown.kind}
            data-mode="band"
          >
            <Words banner={shown} band />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {view.pill && !shown ? (
          <motion.p
            key={view.pill.id}
            className="tv-caption absolute right-[4vh] top-[11vh] z-20 flex items-center gap-[1.4vh] rounded-full px-[2.4vh] py-[1.2vh] font-semibold"
            style={{ background: "var(--surface-2)", boxShadow: "inset 0 0 0 0.2vh color-mix(in srgb, var(--warn) 45%, transparent)" }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            data-testid="tv-pill"
          >
            <span aria-hidden className="h-[1.2vh] w-[1.2vh] rounded-full" style={{ background: "var(--warn)" }} />
            {view.pill.text}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/**
 * The words of a notice. The first ones wait for the backdrop to be ~70 % there; the next notice on
 * the same backdrop (a visitor after a message) changes the words without that wait.
 */
function Words({ banner, band }: { banner: OverlayBanner; band: boolean }) {
  const key = `${banner.kind}:${banner.id}`;
  // the notice the backdrop came up with: only its words wait for the backdrop
  const [first] = useState(key);
  const delay = key === first ? WORDS_AFTER_S : 0;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        initial={{ opacity: 0, scale: band ? 1 : 0.96, y: band ? 10 : 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.22 } }}
        transition={{ duration: 0.5, ease: EASE, delay }}
        className={band ? "flex w-full items-center gap-[4vh]" : "flex max-w-[84vw] flex-col items-center text-center"}
      >
        {band ? <BandWords banner={banner} /> : <CoverWords banner={banner} />}
      </motion.div>
    </AnimatePresence>
  );
}

function CoverWords({ banner }: { banner: OverlayBanner }) {
  if (banner.kind === "visit") {
    return (
      <>
        <DoorMark size="22vh" />
        <p className="tv-hero mt-[4vh] font-bold tracking-[-0.03em]">{banner.title}</p>
        {banner.note ? <p className="tv-lead mt-[2vh] line-clamp-2 font-semibold [overflow-wrap:anywhere]">{banner.note}</p> : null}
        <p className="tv-text mt-[2.4vh] text-muted">
          {banner.since}
          {banner.more > 0 ? ` · ждут ещё ${banner.more}` : ""}
        </p>
      </>
    );
  }
  if (banner.kind === "message") {
    return banner.text ? (
      <>
        <BubbleMark size="16vh" />
        <p className="tv-text mt-[3.4vh] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--accent)" }}>
          {banner.title}
        </p>
        <p
          className={`mt-[2vh] line-clamp-4 font-bold tracking-[-0.02em] [overflow-wrap:anywhere] ${banner.text.length <= SHORT_MESSAGE ? "tv-hero" : "tv-title"}`}
          data-testid="tv-message-text"
        >
          {banner.text}
        </p>
        <p className="tv-text mt-[2.4vh] text-muted">
          {banner.since}
          {banner.more > 0 ? ` · ещё ${banner.more}` : ""}
        </p>
      </>
    ) : (
      // a guest in the office (D-33): the notice without the words
      <>
        <BubbleMark size="16vh" />
        <p className="tv-title mt-[4vh] font-bold tracking-[-0.03em]">{banner.title}</p>
        <p className="tv-text mt-[2.4vh] text-muted">Текст — в вашем телефоне</p>
      </>
    );
  }
  return (
    <>
      <CalendarMark size="18vh" />
      <p className="tv-hero mt-[3.4vh] font-bold tracking-[-0.03em]" style={{ color: "var(--accent)" }}>
        {banner.title}
      </p>
      <p className="tv-lead mt-[2vh] line-clamp-2 font-semibold [overflow-wrap:anywhere]">{banner.detail}</p>
    </>
  );
}

/** The same notice in one row across the bottom third: the mark, the words, when. */
function BandWords({ banner }: { banner: OverlayBanner }) {
  const mark =
    banner.kind === "visit" ? <DoorMark size="11vh" /> : banner.kind === "message" ? <BubbleMark size="11vh" /> : <CalendarMark size="11vh" />;
  const head =
    banner.kind === "message" ? (banner.text ? null : banner.title) : banner.title;
  const body =
    banner.kind === "visit" ? banner.note : banner.kind === "message" ? banner.text : banner.detail;
  const since =
    banner.kind === "visit"
      ? `${banner.since}${banner.more > 0 ? ` · ждут ещё ${banner.more}` : ""}`
      : banner.kind === "message"
        ? banner.text
          ? `${banner.title} · ${banner.since}${banner.more > 0 ? ` · ещё ${banner.more}` : ""}`
          : "Текст — в вашем телефоне"
        : null;
  return (
    <>
      <span className="shrink-0">{mark}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-[0.8vh]">
        {head ? (
          <p className="tv-title font-bold tracking-[-0.03em]" style={banner.kind === "event" ? { color: "var(--accent)" } : undefined}>
            {head}
          </p>
        ) : null}
        {body ? (
          <p
            className={`${head ? "tv-lead" : "tv-title"} line-clamp-2 font-semibold [overflow-wrap:anywhere]`}
            data-testid={banner.kind === "message" ? "tv-message-text" : undefined}
          >
            {body}
          </p>
        ) : null}
        {since ? <p className="tv-caption text-muted">{since}</p> : null}
      </div>
    </>
  );
}

/** A door in a breathing ring: the visitor is at the reception, not in the room yet. */
function DoorMark({ size }: { size: string }) {
  const tone = "var(--accent)";
  return (
    <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full ${s.ring}`}
        style={{ boxShadow: `0 0 0 0.6vh color-mix(in srgb, ${tone} 60%, transparent)`, background: `color-mix(in srgb, ${tone} 12%, transparent)` }}
      />
      <svg viewBox="0 0 48 48" className="relative h-1/2 w-1/2" fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 42h28" />
        <path d="M14 42V8h20v34" />
        <circle cx="29" cy="26" r="1.8" fill={tone} stroke="none" />
      </svg>
    </span>
  );
}

/** A speech bubble in the same breathing ring, smaller: the words are the point, not the mark. */
function BubbleMark({ size }: { size: string }) {
  return (
    <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full ${s.ring}`}
        style={{
          boxShadow: "0 0 0 0.6vh color-mix(in srgb, var(--accent) 60%, transparent)",
          background: "color-mix(in srgb, var(--accent) 12%, transparent)",
        }}
      />
      <svg viewBox="0 0 48 48" className="relative h-1/2 w-1/2" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 12.5A4.5 4.5 0 0 1 13.5 8h21A4.5 4.5 0 0 1 39 12.5v14a4.5 4.5 0 0 1-4.5 4.5H22l-8 7v-7h-.5A4.5 4.5 0 0 1 9 26.5z" />
        <path d="M17 17h14M17 23h9" />
      </svg>
    </span>
  );
}

function CalendarMark({ size }: { size: string }) {
  return (
    <span
      className="flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: "color-mix(in srgb, var(--accent) 12%, transparent)",
        boxShadow: "0 0 0 0.6vh color-mix(in srgb, var(--accent) 55%, transparent)",
      }}
    >
      <svg viewBox="0 0 48 48" className="h-1/2 w-1/2" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="8" y="11" width="32" height="29" rx="4" />
        <path d="M8 19h32M16 7v8M32 7v8" />
        <path d="M24 25v6l4 2" />
      </svg>
    </span>
  );
}
