"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

import { pluralRu } from "@/lib/tasks/status-text";
import { markRung, playChime, rungBefore } from "@/lib/tv/chime";
import type { OverlayBanner, OverlayView } from "@/lib/tv/overlay";

/**
 * The «важно сейчас» layer over any scene of the wall (D-96): a visitor at the secretary's desk,
 * a message from the secretary (D-116) and an event about to start. While a notice is up, it is all
 * the wall shows. The scene under it stays mounted — the notice leaves, and the employee card
 * or the clock is in place with no transition.
 *
 * The three notices are told apart from the doorway (D-185): a visitor — an accent plane and a large «К вам
 * посетитель»; a message — a neutral plane, the secretary's words are the main thing; a meeting — the minutes
 * counted down as one big number. Everything on the left edge of the grid, on the wall's scale, no icons.
 *
 * «Подождёт» is not a notice but a quiet tag under the channel mark: the answer is given, the person waits. «Пусть
 * заходит» simply removes the notice (D-116 §1). Motion is opacity and transform only (the perf contract,
 * D-45); the chime sounds once per visit and per message.
 */

const EASE = [0.2, 0, 0, 1] as const;

/** A short message is a headline read from across the room; a longer one goes a step down. */
const SHORT_MESSAGE = 40;

/** Each notice's own plane: the backdrop under it is the wall's, the tint comes and goes with the words. */
const PLANE: Record<OverlayBanner["kind"], string> = {
  visit: "color-mix(in srgb, var(--accent) 24%, var(--bg))",
  message: "var(--surface-2)",
  event: "color-mix(in srgb, var(--warn) 10%, var(--bg))",
};

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
          // one opaque backdrop while any notice is up: a visitor after a message, the next message after
          // «Понятно» change the words and the plane on it, and the scene underneath never shows through
          <motion.div
            key="banner"
            className="absolute inset-0 z-30"
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
                className="absolute inset-0 flex flex-col justify-center px-[var(--tv-x)] py-[var(--tv-band)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                {/* the plane runs past the screen's edges: the burn-in shift moves the wall a few pixels (TvFrame) */}
                <span aria-hidden className="absolute -inset-[1vh]" style={{ background: PLANE[shown.kind] }} />
                <motion.div
                  className="relative flex min-w-0 max-w-[150vh] flex-col items-start"
                  initial={{ y: "2.2vh" }}
                  animate={{ y: "0vh" }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <Notice banner={shown} />
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {view.pill && !shown ? (
          <motion.p
            key={view.pill.id}
            className="tv-small absolute right-[var(--tv-x)] top-[calc(var(--tv-y)+6.8vh)] z-20 rounded-[1.4vh] px-[2.8vh] py-[1.2vh] font-semibold"
            style={{ background: "color-mix(in srgb, var(--accent) 24%, var(--bg))", color: "var(--tv-text)" }}
            initial={{ opacity: 0, y: "-1vh" }}
            animate={{ opacity: 1, y: "0vh" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            data-testid="tv-pill"
          >
            {view.pill.text}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Notice({ banner }: { banner: OverlayBanner }) {
  if (banner.kind === "visit") {
    return (
      <>
        <p className="tv-title" style={{ color: "var(--tv-text)" }}>
          {banner.title}
        </p>
        {banner.note ? (
          <p className="tv-lead tv-two-lines mt-[3vh] [overflow-wrap:anywhere]" style={{ color: "var(--tv-text)" }}>
            {banner.note}
          </p>
        ) : null}
        <p className="mt-[5vh] flex flex-wrap items-baseline gap-x-[5vh]">
          <span className="tv-lead tv-num" style={{ color: "var(--tv-text)" }}>
            {banner.since}
          </span>
          {banner.more > 0 ? <span className="tv-body text-muted">ждут ещё {banner.more}</span> : null}
        </p>
      </>
    );
  }

  if (banner.kind === "message") {
    return (
      <>
        <p className="tv-small font-semibold text-muted">{banner.title}</p>
        {banner.text ? (
          <p
            className={`mt-[2.4vh] [overflow-wrap:anywhere] ${banner.text.length <= SHORT_MESSAGE ? "tv-title" : "tv-lead"}`}
            style={{ color: "var(--tv-text)" }}
            data-testid="tv-message-text"
          >
            {banner.text}
          </p>
        ) : (
          // a guest in the office (D-33): the notice without the words
          <p className="tv-title mt-[2.4vh]" style={{ color: "var(--tv-text)" }}>
            Текст — в вашем телефоне
          </p>
        )}
        <p className="tv-body mt-[4vh] flex flex-wrap gap-x-[4vh] text-muted">
          <span>{banner.since}</span>
          {banner.more > 0 ? <span>ещё {banner.more} {pluralRu(banner.more, ["сообщение", "сообщения", "сообщений"])}</span> : null}
        </p>
      </>
    );
  }

  return (
    <>
      {banner.minutes !== null ? (
        <p className="flex flex-wrap items-baseline gap-x-[3vh]" data-testid="tv-event-minutes">
          <span className="tv-lead" style={{ color: "var(--tv-text)" }}>
            Через
          </span>
          <span className="tv-hero" style={{ color: "var(--warn)" }}>
            {banner.minutes}
          </span>
          <span className="tv-title" style={{ color: "var(--warn)" }}>
            мин
          </span>
        </p>
      ) : (
        <p className="tv-title" style={{ color: "var(--warn)" }}>
          Начинается
        </p>
      )}
      <p className="tv-title tv-two-lines mt-[3vh] [overflow-wrap:anywhere]" style={{ color: "var(--tv-text)" }}>
        {banner.title}
      </p>
      {banner.place ? <p className="tv-body mt-[2vh] text-muted">{banner.place}</p> : null}
    </>
  );
}
