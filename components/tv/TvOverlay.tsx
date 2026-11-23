"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

import { pluralRu } from "@/lib/tasks/status-text";
import { markRung, playChime, rungBefore } from "@/lib/tv/chime";
import type { OverlayBanner, OverlayView } from "@/lib/tv/overlay";

/**
 * The «важно сейчас» layer over any scene of the wall (D-96): a visitor at the secretary's desk,
 * a message from the secretary (D-116) and an event about to start. While a notice is up, it is all
 * the scene shows; the channel mark above and the band with the clock below stay — the notice covers the
 * scene's area only. The scene under it stays mounted — the notice leaves, and the employee card
 * or the clock is in place with no transition.
 *
 * One template for the three (D-185): the wall's own background, a bar of the «now» colour along the top
 * edge, and the grid's two columns. In the main one, a caption in plain case (what it is), the headline (who
 * or what, in the secretary's or the calendar's words) and one quiet line under it; in the side one, the
 * figure the room reads from the door — the minutes to the meeting as one big number, how long the
 * visitor has waited, when the message came. No icons, no planes of their own: the three differ by words.
 *
 * After its first minute a visitor or a message folds into a quiet plate under the channel mark (`view.pill`,
 * the words come ready from `overlayOf`) — one look for all three kinds, the wall's «now» plate (`.tv-now`).
 * «Пусть заходит» simply removes the notice (D-116 §1). Motion is opacity and transform only (the perf
 * contract, D-45); the chime sounds once per visit and per message.
 */

const EASE = [0.2, 0, 0, 1] as const;

/** A headline up to this long fits two lines of tv-title in the main column; a longer one goes a step down. */
const SHORT_HEADLINE = 30;
/** A visitor's note splits at its first comma when the part before it is this short (a name, a company). */
const SHORT_HEAD = 26;
/** A message longer than this takes both columns: the words are the notice, «только что» moves to the caption. */
const WIDE_MESSAGE = 90;

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
          // «Понятно» change the words on it, and the scene underneath never shows through. It ends at the band:
          // the clock and the news line stay where they are
          <motion.div
            key="banner"
            className="absolute inset-x-0 top-0 bottom-[var(--tv-band)] z-30"
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
            {/* the plane and the bar run past the screen's edges: the burn-in shift moves the wall a few pixels (TvFrame) */}
            <span aria-hidden className="absolute -inset-x-[1vh] -top-[1vh] bottom-0" style={{ background: "var(--bg)" }} />
            <span aria-hidden className="absolute -inset-x-[1vh] -top-[1vh] h-[2.2vh]" style={{ background: "var(--tv-live)" }} />
            <AnimatePresence mode="wait">
              <motion.div
                key={`${shown.kind}:${shown.id}`}
                className="tv-box absolute inset-0"
                initial={{ opacity: 0, y: "2.2vh" }}
                animate={{ opacity: 1, y: "0vh" }}
                exit={{ opacity: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <Notice banner={shown} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {view.pill && !shown ? (
          <motion.p
            key={view.pill.id}
            // under the channel mark, no wider than the grid's side column; the words wrap, never cut
            className="tv-small tv-now absolute right-[var(--tv-x)] top-[calc(var(--tv-y)+7.4vh)] z-20 max-w-[calc((100%-2*var(--tv-x)-var(--tv-gap))*5/12)] px-[2.8vh] py-[1.4vh] font-semibold [text-wrap:pretty]"
            style={{ color: "var(--tv-text)" }}
            initial={{ opacity: 0, y: "-1vh" }}
            animate={{ opacity: 1, y: "0vh" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            data-testid="tv-pill"
            data-kind={view.pill.kind}
          >
            {view.pill.text}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/** What the side column says: one number with its caption and unit, or one word when there is no number. */
type Figure = { caption: string | null; value: string; unit: string | null };

/**
 * «Иванов, по поставкам бетона» → «Иванов» for the headline and «по поставкам бетона» under it: the secretary
 * writes who first. A note without a short head before its first comma stays whole.
 */
function splitNote(note: string): [string, string | null] {
  const comma = note.indexOf(",");
  const rest = comma > 0 ? note.slice(comma + 1).trim() : "";
  return comma > 0 && comma <= SHORT_HEAD && rest ? [note.slice(0, comma).trim(), rest] : [note, null];
}

/**
 * «ждёт 3 мин» → the number apart. In its first minute over the wall a visitor has waited «только
 * что» — no number yet, and a word in the figure's place would only shout: the side stays empty.
 */
function waitFigure(since: string): Figure | null {
  const minutes = /^ждёт (\d+) мин$/.exec(since);
  return minutes ? { caption: "ждёт", value: minutes[1], unit: "мин" } : null;
}

function Notice({ banner }: { banner: OverlayBanner }) {
  if (banner.kind === "visit") {
    const [who, about] = banner.note ? splitNote(banner.note) : [banner.title, null];
    return (
      <Layout
        caption={banner.note ? banner.title : null}
        headline={who}
        detail={about}
        line={banner.more > 0 ? `ждут ещё ${banner.more}` : null}
        figure={waitFigure(banner.since)}
      />
    );
  }

  if (banner.kind === "message") {
    const text = banner.text ?? "";
    const more = banner.more > 0 ? `ещё ${banner.more} ${pluralRu(banner.more, ["сообщение", "сообщения", "сообщений"])}` : null;
    if (text.length > WIDE_MESSAGE) {
      // the words take both columns; when it came goes beside the caption
      return (
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <p className="tv-small flex flex-wrap gap-x-[3vh] font-semibold">
            <span style={{ color: "var(--tv-live)" }}>{banner.title}</span>
            <span className="text-muted">{banner.since}</span>
          </p>
          <p className="tv-lead mt-[2.4vh] [overflow-wrap:anywhere] [text-wrap:pretty]" style={{ color: "var(--tv-text)" }} data-testid="tv-message-text">
            {text}
          </p>
          {more ? <p className="tv-small mt-[3vh] text-muted">{more}</p> : null}
        </div>
      );
    }
    return <Layout caption={banner.title} headline={text} line={more} figure={null} testId="tv-message-text" />;
  }

  return (
    <Layout
      caption={banner.untitled ? null : "Встреча"}
      headline={banner.title}
      line={banner.place}
      figure={banner.minutes !== null ? { caption: "через", value: String(banner.minutes), unit: "мин" } : { caption: null, value: "Начинается", unit: null }}
      figureTestId={banner.minutes !== null ? "tv-event-minutes" : undefined}
    />
  );
}

/** The template: caption, headline and a quiet line in the main column; the figure in the side one. */
function Layout({
  caption,
  headline,
  detail = null,
  line,
  figure,
  testId,
  figureTestId,
}: {
  caption: string | null;
  headline: string;
  /** What the headline is about, a step down: a visitor's business. */
  detail?: string | null;
  line: string | null;
  figure: Figure | null;
  testId?: string;
  figureTestId?: string;
}) {
  const short = headline.length <= SHORT_HEADLINE;
  return (
    <div className="tv-split min-h-0 flex-1 items-center">
      <div className="flex min-w-0 flex-col">
        {caption ? (
          <p className="tv-small mb-[2vh] font-semibold" style={{ color: "var(--tv-live)" }}>
            {caption}
          </p>
        ) : null}
        <p
          // a long headline goes a step down and keeps its words: three lines at most, never an ellipsis
          className={`[overflow-wrap:anywhere] [text-wrap:balance] ${short ? "tv-title tv-two-lines" : "tv-lead max-h-[3lh] overflow-hidden"}`}
          style={{ color: "var(--tv-text)" }}
          data-testid={testId}
        >
          {headline}
        </p>
        {detail ? (
          <p className="tv-body tv-two-lines mt-[1.6vh] [overflow-wrap:anywhere]" style={{ color: "color-mix(in srgb, var(--tv-text) 86%, transparent)" }}>
            {detail}
          </p>
        ) : null}
        {line ? <p className="tv-small mt-[2.4vh] text-muted">{line}</p> : null}
      </div>

      {figure ? (
      <div className="flex min-w-0 flex-col" data-testid={figureTestId}>
        {figure.caption ? <p className="tv-small text-muted">{figure.caption}</p> : null}
        {figure.unit ? (
          <p className="flex items-baseline gap-[2vh]">
            <span className="tv-hero" style={{ color: "var(--tv-text)" }}>
              {figure.value}
            </span>
            <span className="tv-title text-muted">{figure.unit}</span>
          </p>
        ) : (
          // a word, not a number («Начинается»): large, but a step quieter than the headline
          <p className="tv-title text-muted">{figure.value}</p>
        )}
      </div>
      ) : null}
    </div>
  );
}
