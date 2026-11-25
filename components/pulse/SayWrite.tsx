"use client";

import { useRef, useState, type ReactNode } from "react";

import { haptic } from "@/lib/haptics";
import { useComposeStore } from "@/lib/store/compose";
import { useIngestStore } from "@/lib/store/ingest";

import { FACE } from "./home/stage";

/** From the resting face's box down to the row: room for the stage pill «Слушаю… 0:07» over it. */
const ROW_GAP = 40;
const ROW_H = 44;
/**
 * Where the floor of idlers starts under the middle of the face while the row stands there
 * (`teamField`'s `skirt`): the face's half box, the gap and the row — the circles keep clear of it.
 */
export const SAY_WRITE_SKIRT = (FACE + 24) / 2 + ROW_GAP + ROW_H;

const PILL =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 font-display text-[15px] font-semibold leading-5 transition-transform duration-[120ms] ease-out active:scale-[0.97]";

/**
 * The director's two inputs as buttons under the resting face (owner, 2026-11-25): the face stays the
 * lever (D-60) — hold to speak, pull down to type — and these are the same two ways in, in sight for
 * whoever does not know the gestures yet. Never a step on the main path (principle 1).
 *
 * «Сказать» runs the very pipeline the held face runs (`startVoice` → `stopVoice`: the recording is
 * stored before any AI, principle 5). A visible button is pressed, not held: a press starts, and the row
 * turns into «Отправить» and «Отменить» for as long as this recording lasts; the face meanwhile listens
 * and counts the seconds as always. «Написать» opens the same typed input as the pull down (the compose
 * request the face listens to). A recording started on the face itself, or from somebody's circle,
 * belongs to its own gesture: the row steps aside.
 */
export function SayWrite({ show }: { show: boolean }) {
  const stage = useIngestStore((state) => state.stage);
  const startVoice = useIngestStore((state) => state.startVoice);
  const stopVoice = useIngestStore((state) => state.stopVoice);
  const cancelVoice = useIngestStore((state) => state.cancelVoice);
  // this row started the recording that is on now
  const [mine, setMine] = useState(false);
  const started = useRef<Promise<void> | null>(null);
  // the recording ended — sent, refused by the microphone, cancelled: the row is done with it
  if (mine && stage !== "recording") setMine(false);

  const say = () => {
    haptic([15, 30, 15]);
    setMine(true);
    started.current = startVoice();
  };
  // the microphone's permission may still be on its way: never stop before it lands
  const send = async () => {
    await started.current;
    started.current = null;
    await stopVoice();
  };
  const cancel = async () => {
    await started.current;
    started.current = null;
    cancelVoice();
  };

  if (mine && stage === "recording") {
    return (
      <Row>
        <button
          type="button"
          onClick={() => void send()}
          className={`${PILL} border-transparent text-bg`}
          style={{ background: "var(--accent)" }}
          data-testid="say-send"
        >
          <SendIcon />
          Отправить
        </button>
        <button type="button" onClick={() => void cancel()} className={`${PILL} border-border bg-surface-2 text-muted`} data-testid="say-cancel">
          Отменить
        </button>
      </Row>
    );
  }
  // a new phrase may start where the held face may start one (`startVoice`): at rest, after an error, after an answer
  if (!show || (stage !== "idle" && stage !== "error" && stage !== "question")) return null;
  return (
    <Row>
      <button type="button" onClick={say} className={`${PILL} border-border bg-surface-2 text-text`} data-testid="say">
        <MicIcon />
        Сказать
      </button>
      <button
        type="button"
        onClick={() => useComposeStore.getState().request("")}
        className={`${PILL} border-border bg-surface-2 text-text`}
        data-testid="write"
      >
        <PenIcon />
        Написать
      </button>
    </Row>
  );
}

/** Right under the face's box, clear of the stage pill; above the dream that flies round the head. */
function Row({ children }: { children: ReactNode }) {
  return (
    <div className="card-in relative z-10 flex shrink-0 justify-center gap-2" style={{ marginTop: ROW_GAP, height: ROW_H }} data-testid="say-write">
      {children}
    </div>
  );
}

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE} aria-hidden>
      <path d="M4.5 12 19.5 5l-4 14-3.5-5.5L4.5 12zM12 13.5l3.5-4" />
    </svg>
  );
}
