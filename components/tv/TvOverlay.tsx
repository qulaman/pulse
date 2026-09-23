"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { markRung, playChime, rungBefore } from "@/lib/tv/chime";
import { INVITED_MS, type OverlayView } from "@/lib/tv/overlay";

import s from "./tv.module.css";

/**
 * Слой «важно сейчас» поверх любой сцены стены (D-96): посетитель у стола секретаря и
 * мероприятие, которое вот-вот начнётся. Пока надпись висит, на стене только она: яркое лицо
 * маскота сквозь полупрозрачную подложку спорило с текстом. Сцена под ней остаётся
 * смонтированной — надпись ушла, и карточка сотрудника или часы на месте без перехода.
 *
 * «Подождёт» — не надпись, а тихая плашка в углу: ответ дан, человек ждёт.
 * Движение — только opacity и transform (перф-контракт D-45); звонок — один раз на визит.
 */

const EASE = [0.2, 0, 0, 1] as const;

export function TvOverlay({ view, sound }: { view: OverlayView; sound: boolean }) {
  const banner = view.banner;
  // «Заходите» leaves by the kiosk's own timer: the wall clock ticks only every ten seconds
  const [gone, setGone] = useState<string | null>(null);
  const invitedId = banner?.kind === "visit-in" ? banner.id : null;
  useEffect(() => {
    if (!invitedId) return;
    const timer = setTimeout(() => setGone(invitedId), INVITED_MS);
    return () => clearTimeout(timer);
  }, [invitedId]);

  // one ring per visitor, and not again after the kiosk restarts
  const ringId = banner?.kind === "visit" ? banner.id : null;
  useEffect(() => {
    if (!ringId || !sound || rungBefore(ringId)) return;
    markRung(ringId);
    playChime();
  }, [ringId, sound]);

  const shown = banner && !(banner.kind === "visit-in" && gone === banner.id) ? banner : null;

  return (
    <>
      <AnimatePresence>
        {shown ? (
          <motion.div
            key={`${shown.kind}:${shown.id}`}
            className="absolute inset-0 z-30 flex items-center justify-center px-[6vh]"
            style={{ background: "var(--bg)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.35 } }}
            transition={{ duration: 0.5, ease: EASE }}
            data-testid="tv-overlay"
            data-kind={shown.kind}
          >
            <motion.div
              initial={{ scale: 0.94, y: 18 }}
              animate={{ scale: 1, y: 0 }}
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
              ) : shown.kind === "visit-in" ? (
                <>
                  <DoorMark tone="var(--ok)" open />
                  <p className="mt-[4vh] text-[12vh] font-bold leading-[13vh] tracking-[-0.03em]" style={{ color: "var(--ok)" }}>
                    {shown.title}
                  </p>
                </>
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
function DoorMark({ tone, open = false }: { tone: string; open?: boolean }) {
  return (
    <span className="relative flex h-[22vh] w-[22vh] items-center justify-center">
      <span
        aria-hidden
        className={`absolute inset-0 rounded-full ${open ? "" : s.ring}`}
        style={{ boxShadow: `0 0 0 0.6vh color-mix(in srgb, ${tone} 60%, transparent)`, background: `color-mix(in srgb, ${tone} 12%, transparent)` }}
      />
      <svg viewBox="0 0 48 48" className="relative h-[11vh] w-[11vh]" fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M10 42h28" />
        <path d="M14 42V8h20v34" />
        {open ? <path d="M14 8l12 4v32l-12-2" fill={`color-mix(in srgb, ${tone} 25%, transparent)`} /> : <circle cx="29" cy="26" r="1.8" fill={tone} stroke="none" />}
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
