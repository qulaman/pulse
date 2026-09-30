"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

import { markRung, playChime, rungBefore } from "@/lib/tv/chime";
import type { OverlayView } from "@/lib/tv/overlay";

import s from "./tv.module.css";

/**
 * Слой «важно сейчас» поверх любой сцены стены (D-96): посетитель у стола секретаря,
 * сообщение секретаря (D-116) и мероприятие, которое вот-вот начнётся. Пока надпись висит, на
 * стене только она: яркое лицо маскота сквозь полупрозрачную подложку спорило с текстом.
 * Сцена под ней остаётся смонтированной — надпись ушла, и карточка сотрудника или часы на
 * месте без перехода.
 *
 * «Подождёт» — не надпись, а тихая плашка в углу: ответ дан, человек ждёт. «Пусть заходит»
 * надпись просто убирает (D-116 §1).
 * Движение — только opacity и transform (перф-контракт D-45); звонок — один раз на визит
 * и на сообщение.
 */

const EASE = [0.2, 0, 0, 1] as const;

/** A short message is read from across the room; a long one still fits in four lines. */
const SHORT_MESSAGE = 40;

export function TvOverlay({ view, sound, onCovered }: { view: OverlayView; sound: boolean; onCovered?: () => void }) {
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
        {shown ? (
          // one backdrop while any notice is up: a visitor after a message, the next message after
          // «Понятно» change the words on it, and the scene underneath never shows through
          <motion.div
            key="banner"
            className="absolute inset-0 z-30 flex items-center justify-center px-[6vh]"
            style={{ background: "var(--bg)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.35 } }}
            transition={{ duration: 0.5, ease: EASE }}
            // fully opaque: the wall under it need not be drawn (TvFrame)
            onAnimationComplete={(target) => {
              if (typeof target === "object" && target !== null && "opacity" in target && target.opacity === 1) onCovered?.();
            }}
            data-testid="tv-overlay"
            data-kind={shown.kind}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={`${shown.kind}:${shown.id}`}
                initial={{ opacity: 0, scale: 0.94, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.55, ease: EASE }}
                className="flex max-w-[84vw] flex-col items-center text-center"
              >
                {shown.kind === "visit" ? (
                  <>
                    <DoorMark tone="var(--accent)" />
                    <p className="mt-[4vh] text-[11vh] font-bold leading-[12vh] tracking-[-0.03em]">{shown.title}</p>
                    {shown.note ? (
                      <p className="mt-[2vh] line-clamp-2 text-[5.4vh] font-semibold leading-[6.6vh] [overflow-wrap:anywhere]">
                        {shown.note}
                      </p>
                    ) : null}
                    <p className="mt-[2.4vh] text-[3.4vh] leading-[4.4vh] text-muted">
                      {shown.since}
                      {shown.more > 0 ? ` · ждут ещё ${shown.more}` : ""}
                    </p>
                  </>
                ) : shown.kind === "message" ? (
                  shown.text ? (
                    <>
                      <BubbleMark />
                      <p
                        className="mt-[3.4vh] text-[3.6vh] font-semibold uppercase leading-[4.4vh] tracking-[0.08em]"
                        style={{ color: "var(--accent)" }}
                      >
                        {shown.title}
                      </p>
                      <p
                        className={`mt-[2vh] line-clamp-4 font-bold tracking-[-0.02em] [overflow-wrap:anywhere] ${
                          shown.text.length <= SHORT_MESSAGE ? "text-[9vh] leading-[10.4vh]" : "text-[6.4vh] leading-[7.8vh]"
                        }`}
                        data-testid="tv-message-text"
                      >
                        {shown.text}
                      </p>
                      <p className="mt-[2.4vh] text-[3.4vh] leading-[4.4vh] text-muted">
                        {shown.since}
                        {shown.more > 0 ? ` · ещё ${shown.more}` : ""}
                      </p>
                    </>
                  ) : (
                    // a guest in the office (D-33): the notice without the words
                    <>
                      <BubbleMark />
                      <p className="mt-[4vh] text-[9vh] font-bold leading-[10vh] tracking-[-0.03em]">{shown.title}</p>
                      <p className="mt-[2.4vh] text-[3.4vh] leading-[4.4vh] text-muted">Текст — в вашем телефоне</p>
                    </>
                  )
                ) : (
                  <>
                    <CalendarMark />
                    <p className="mt-[3.4vh] text-[9vh] font-bold leading-[10vh] tracking-[-0.03em]" style={{ color: "var(--accent)" }}>
                      {shown.title}
                    </p>
                    <p className="mt-[2vh] line-clamp-2 text-[5vh] font-semibold leading-[6.2vh] [overflow-wrap:anywhere]">
                      {shown.detail}
                    </p>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {view.pill && !shown ? (
          <motion.p
            key={view.pill.id}
            className="absolute right-[4vh] top-[11vh] z-20 flex items-center gap-[1.4vh] rounded-full px-[2.4vh] py-[1.2vh] text-[2.6vh] font-semibold leading-[3.2vh]"
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

/** A door in a breathing ring: the visitor is at the reception, not in the room yet. */
function DoorMark({ tone }: { tone: string }) {
  return (
    <span className="relative flex h-[22vh] w-[22vh] items-center justify-center">
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full ${s.ring}`}
        style={{ boxShadow: `0 0 0 0.6vh color-mix(in srgb, ${tone} 60%, transparent)`, background: `color-mix(in srgb, ${tone} 12%, transparent)` }}
      />
      <svg viewBox="0 0 48 48" className="relative h-[11vh] w-[11vh]" fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 42h28" />
        <path d="M14 42V8h20v34" />
        <circle cx="29" cy="26" r="1.8" fill={tone} stroke="none" />
      </svg>
    </span>
  );
}

/** A speech bubble in the same breathing ring, smaller: the words are the point, not the mark. */
function BubbleMark() {
  return (
    <span className="relative flex h-[16vh] w-[16vh] items-center justify-center">
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full ${s.ring}`}
        style={{
          boxShadow: "0 0 0 0.6vh color-mix(in srgb, var(--accent) 60%, transparent)",
          background: "color-mix(in srgb, var(--accent) 12%, transparent)",
        }}
      />
      <svg viewBox="0 0 48 48" className="relative h-[8vh] w-[8vh]" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 12.5A4.5 4.5 0 0 1 13.5 8h21A4.5 4.5 0 0 1 39 12.5v14a4.5 4.5 0 0 1-4.5 4.5H22l-8 7v-7h-.5A4.5 4.5 0 0 1 9 26.5z" />
        <path d="M17 17h14M17 23h9" />
      </svg>
    </span>
  );
}

function CalendarMark() {
  return (
    <span
      className="flex h-[18vh] w-[18vh] items-center justify-center rounded-full"
      style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", boxShadow: "0 0 0 0.6vh color-mix(in srgb, var(--accent) 55%, transparent)" }}
    >
      <svg viewBox="0 0 48 48" className="h-[9vh] w-[9vh]" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="8" y="11" width="32" height="29" rx="4" />
        <path d="M8 19h32M16 7v8M32 7v8" />
        <path d="M24 25v6l4 2" />
      </svg>
    </span>
  );
}
