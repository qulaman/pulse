"use client";

import { useEffect, useRef, useState } from "react";

import { Dot } from "@/components/notes/NoteCard";
import { NoteIcon } from "@/components/notes/icons";
import type { Dictation } from "@/lib/notes/dictation";

/** Minutes and seconds since the microphone opened, written into the text node directly. */
function RecTimer({ startedAt }: { startedAt: number | null }) {
  const node = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const paint = () => {
      if (!node.current) return;
      const total = Math.max(0, Math.floor((startedAt ? Date.now() - startedAt : 0) / 1000));
      node.current.textContent = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
    };
    paint();
    const id = setInterval(paint, 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span ref={node} className="nums font-display text-[17px] font-bold leading-[22px]" style={{ color: "var(--accent)" }} />;
}

type Props = {
  pointId: string;
  /** The screen's one microphone (D-121): the status screen and every «+ подпункт» share it. */
  dictation: Dictation;
  /** Whose words the microphone takes now: this point's id — a sub-point here; anything else — not here. */
  aimed: string | null;
  /** The microphone is about to open for this point. */
  onAim: () => void;
  onWrite: (text: string) => void;
  /** No sub-points yet: say how the row works. */
  first: boolean;
};

/**
 * «+ подпункт» at the end of an open point (D-121): hold the microphone and say it — one
 * press is one sub-point, word for word, no parser (the dictaphone of the board with the
 * point as the parent) — or type it and press Enter. The row stays ready for the next one.
 * One microphone per screen: while the status screen or another point records, this key
 * rests; any stop key ends the one recording.
 */
export function SubComposer({ pointId, dictation, aimed, onAim, onWrite, first }: Props) {
  const [draft, setDraft] = useState("");
  const recording = dictation.stage === "recording";
  const here = recording && aimed === pointId;
  const elsewhere = recording && !here;
  const stuck = dictation.stage === "saving" || dictation.stage === "failed";
  const mode = here ? "stop" : draft.trim() ? "send" : "mic";
  const resting = mode === "mic" && (elsewhere || stuck);

  const send = () => {
    const text = draft.replace(/\s+/g, " ").trim();
    if (!text) return;
    setDraft("");
    onWrite(text);
  };

  const label = mode === "stop" ? "Закончить запись подпункта" : mode === "send" ? "Записать подпункт" : "Диктовать подпункт";

  return (
    <div className="mt-1">
      <div
        className={`flex min-h-[52px] items-center gap-2 rounded-[16px] border pl-3 pr-1 transition-colors duration-[160ms] focus-within:border-accent/55 ${
          here ? "border-accent/55 bg-accent/[0.07]" : "border-dashed border-border"
        }`}
        data-testid="sub-composer"
      >
        {here ? (
          <>
            <Dot tone="accent" pulse />
            <RecTimer startedAt={dictation.startedAt} />
            <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-muted">
              {dictation.latched ? "■ — сохраню" : "Отпустите — сохраню"}
            </span>
            <button
              type="button"
              onClick={dictation.cancel}
              data-testid="sub-cancel"
              className="min-h-[44px] shrink-0 rounded-[12px] px-2.5 text-[14px] font-semibold text-muted transition-colors duration-[120ms] active:bg-white/[0.06]"
            >
              Отмена
            </button>
          </>
        ) : (
          <>
            <span aria-hidden className="shrink-0 text-accent">
              <NoteIcon name="plus" size={17} />
            </span>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
              enterKeyHint="send"
              maxLength={2000}
              placeholder="Подпункт"
              aria-label="Новый подпункт"
              data-testid="sub-draft"
              className="min-h-[44px] min-w-0 flex-1 bg-transparent text-[16px] leading-[22px] text-text outline-none placeholder:text-muted"
            />
          </>
        )}

        <button
          type="button"
          aria-label={label}
          data-testid="sub-key"
          data-mode={mode}
          disabled={resting}
          // the walkie-talkie contract of the status screen's key: a held key is not a scroll
          style={{ WebkitTouchCallout: "none", touchAction: "none" }}
          onContextMenu={(event) => event.preventDefault()}
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-[transform,opacity] duration-[120ms] active:scale-[0.92] disabled:opacity-35 ${
            mode === "mic" ? "bg-accent/15 text-accent" : "btn-primary text-bg"
          }`}
          onPointerDown={(event) => {
            if (mode !== "mic" && mode !== "stop") return;
            if (resting) return;
            // the finger may slide off the key while talking: the release still comes here
            event.currentTarget.setPointerCapture?.(event.pointerId);
            if (mode === "mic") onAim();
            dictation.press();
          }}
          onPointerUp={() => {
            if ((mode === "mic" && !resting) || mode === "stop") dictation.release();
          }}
          onPointerCancel={() => {
            // the browser took the gesture: whatever was said is saved, not lost
            if (here) dictation.release();
          }}
          onClick={(event) => {
            if (mode === "send") send();
            else if (event.detail === 0 && !resting) {
              // Enter or Space: no hold on a keyboard, so the key is a toggle
              if (mode === "mic") onAim();
              dictation.toggle();
            }
          }}
        >
          {here ? <span aria-hidden className="absolute inset-0 rounded-full border-2 border-accent" style={{ animation: "pick-pulse 1.4s ease-out infinite" }} /> : null}
          <NoteIcon name={mode === "stop" ? "stop" : mode === "send" ? "up" : "mic"} size={20} />
        </button>
      </div>
      {first && mode === "mic" ? (
        <p className="mt-1.5 px-1 text-[12px] leading-4 text-muted">удержите микрофон и скажите — или напишите</p>
      ) : null}
    </div>
  );
}
