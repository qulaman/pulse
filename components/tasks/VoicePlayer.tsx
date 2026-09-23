"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A voice in a task card, played by us and not by the browser. The native
 * `<audio controls>` widget looks like a different product on every phone and is
 * the one chrome in Pulse nobody designed; this is a wave, a play head and the
 * length — one row, thumb-sized, the same on a Redmi and an iPhone.
 *
 * The URL is signed on the first tap, never on render: a thread of thirty
 * recordings must not sign thirty objects nobody plays.
 */

/** Enough bars to read as speech, few enough to stay cheap on a budget Android. */
const BAR_COUNT = 28;
/** One full swell crosses the track in this time while the recording plays. */
const WAVE_MS = 1500;

/** Deterministic wave: the same recording is drawn the same way on every device. */
function barsFor(seed: string): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    // speech swells in the middle and tails off — a flat noise field reads as static
    const envelope = 0.55 + 0.45 * Math.sin((Math.PI * (i + 0.5)) / BAR_COUNT);
    return Math.max(0.18, Math.min(1, next() * 0.85 * envelope + 0.22));
  });
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * One row of bars. It is drawn twice — muted underneath, accent on top under a
 * moving clip — so the play head fills a bar gradually instead of flipping whole
 * bars from grey to green four times a second.
 */
function Wave({ bars, tone, playing }: { bars: number[]; tone: string; playing: boolean }) {
  return (
    <div className="flex h-8 items-center gap-[2px]">
      {bars.map((height, index) => (
        <span
          key={index}
          className={`w-[3px] shrink-0 rounded-full ${tone}`}
          style={{
            height: `${Math.round(height * 26)}px`,
            transformOrigin: "center",
            // a NEGATIVE delay spread over exactly one cycle: every bar is already
            // mid-swell at its own phase, so a single crest rolls along the wave in the
            // direction of playback instead of every bar flickering out of step
            ...(playing
              ? {
                  animation: `voice-bar ${WAVE_MS}ms ease-in-out infinite`,
                  animationDelay: `-${Math.round((1 - index / BAR_COUNT) * WAVE_MS)}ms`,
                }
              : {}),
          }}
        />
      ))}
    </div>
  );
}

type Props = {
  /** Signs the object and hands back a playable URL — called once, on the first tap. */
  load: () => Promise<string>;
  /** Length written down when the message was sent; older rows learn it from the file. */
  durationMs?: number | null;
  /** Anything stable and unique — the wave is drawn from it. */
  seed: string;
  /** «Не открылось…» under the row. */
  failedText?: string;
  className?: string;
};

export function VoicePlayer({ load, durationMs, seed, failedText = "Не открылось. Попробуй позже", className = "" }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const [bars] = useState(() => barsFor(seed));
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  // MediaRecorder files often report Infinity until they are fully buffered, so the
  // length we were told at send time wins; the file is only the fallback (D-66).
  const [fileMs, setFileMs] = useState<number | null>(null);

  const totalMs = durationMs && durationMs > 0 ? durationMs : fileMs;
  const played = totalMs && totalMs > 0 ? Math.min(1, elapsedMs / totalMs) : 0;
  const clipFor = (ratio: number) => `inset(0 ${((1 - ratio) * 100).toFixed(2)}% 0 0)`;

  /**
   * The play head moves every frame, but React hears about it once a second. Sixty
   * renders a second for a line that slides would cost more than the line is worth, and
   * `timeupdate` alone fires about four times a second — that is what made the colour
   * jump from bar to bar. So: the clip edge is written straight onto the node, and only
   * the digits of the counter pull a render.
   */
  useEffect(() => {
    if (!playing || !totalMs) return;
    let frame = 0;
    // The head is read from the sound itself every frame, never extrapolated: a clock of
    // our own would slide ahead of what the ear hears whenever playback is throttled.
    let painted = (audio.current?.currentTime ?? 0) * 1000;
    const tick = () => {
      const element = audio.current;
      if (element) {
        const media = Math.min(totalMs, element.currentTime * 1000);
        // The audio clock wobbles a few milliseconds around itself, which shows as a head
        // twitching back and forth, so it only ever moves forward — unless it moved a long
        // way back, which is a seek and must be obeyed at once.
        painted = media < painted - 250 ? media : Math.max(painted, media);
        const ms = painted;
        if (fill.current) fill.current.style.clipPath = clipFor(ms / totalMs);
        setElapsedMs((was) => (clock(totalMs - ms) === clock(totalMs - was) ? was : ms));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, totalMs]);

  /**
   * Standing still, the head is painted from state. It is deliberately NOT a style prop:
   * the counter only re-renders once a second, so any other render of the thread —
   * a Realtime patch, a refetch — would have snapped the fill back to where the digits
   * last were, up to a second behind the sound. That was the stutter.
   */
  useEffect(() => {
    if (playing || !fill.current) return;
    fill.current.style.clipPath = clipFor(played);
  }, [playing, played]);

  useEffect(() => {
    const element = audio.current;
    if (!element || !url) return;
    void element.play().catch(() => setFailed(true));
  }, [url]);

  const toggle = async () => {
    const element = audio.current;
    if (element && url) {
      if (element.paused) void element.play().catch(() => setFailed(true));
      else element.pause();
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      setUrl(await load());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  /** Tap the wave: it starts the recording if nothing is loaded, else moves the play head. */
  const seek = (clientX: number) => {
    const element = audio.current;
    const box = track.current?.getBoundingClientRect();
    if (!url) {
      void toggle();
      return;
    }
    if (!element || !box || !totalMs) return;
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    element.currentTime = (ratio * totalMs) / 1000;
    if (fill.current) fill.current.style.clipPath = clipFor(ratio);
    setElapsedMs(ratio * totalMs);
  };

  return (
    <div className={`mt-2 ${className}`}>
      {/* w-fit, and every bar has a real width: a bubble with no words shrinks to its
          content, and a track of flex-1 bars would collapse to nothing inside it */}
      <div className="flex w-fit max-w-full items-center gap-3 rounded-full border border-border bg-surface-2 py-2 pl-2 pr-3">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={loading}
          aria-label={playing ? "Пауза" : "Слушать голосовое"}
          data-playing={playing ? "true" : "false"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-bg transition-transform duration-[120ms] active:scale-[0.94] disabled:opacity-60"
        >
          {loading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-bg/40 border-t-bg" />
          ) : playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="4" width="4" height="16" rx="1.4" />
              <rect x="14" y="4" width="4" height="16" rx="1.4" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          )}
        </button>

        <div
          ref={track}
          onPointerDown={(event) => seek(event.clientX)}
          className="relative"
          style={{ touchAction: "none" }}
        >
          <Wave bars={bars} tone="bg-text/25" playing={playing} />
          <div ref={fill} className="absolute inset-0" aria-hidden>
            <Wave bars={bars} tone="bg-accent" playing={playing} />
          </div>
        </div>

        <span className="nums w-[34px] shrink-0 text-right text-[12px] leading-4 text-muted">
          {totalMs ? clock(playing || elapsedMs > 0 ? totalMs - elapsedMs : totalMs) : "—"}
        </span>
      </div>

      {url ? (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          className="hidden"
          onPlay={() => setPlaying(true)}
          onPause={(event) => {
            setElapsedMs(event.currentTarget.currentTime * 1000);
            setPlaying(false);
          }}
          onLoadedMetadata={(event) => {
            const seconds = event.currentTarget.duration;
            if (Number.isFinite(seconds) && seconds > 0) setFileMs(seconds * 1000);
          }}
          onEnded={() => {
            setPlaying(false);
            setElapsedMs(0);
            if (fill.current) fill.current.style.clipPath = clipFor(0);
          }}
          onError={() => setFailed(true)}
        />
      ) : null}

      {failed ? <p className="mt-1 text-[13px] leading-4 text-danger">{failedText}</p> : null}
    </div>
  );
}
