"use client";

import { useEffect, useRef, useState } from "react";

export type TypedLine = { id: string; text: string };

const TICK_MS = 24;
const CHARS_PER_TICK = 2;
/** A breath between two lines — the assistant speaks in sentences, not in a stream. */
const LINE_PAUSE_MS = 320;

type Progress = Record<string, number>;

/**
 * Letters appear one after another, line by line, like the assistant is talking.
 * Lines added later (Realtime) queue up behind the ones already said; `replayKey`
 * starts the whole briefing over. With `prefers-reduced-motion` everything is shown
 * at once. Returns how many characters of each line are visible.
 */
export function useTypewriter(lines: TypedLine[], replayKey = 0) {
  const [state, setState] = useState<{ key: number; shown: Progress }>({ key: replayKey, shown: {} });
  // a replay wipes the progress: derived-state reset during render, refs reset in effects below
  if (state.key !== replayKey) setState({ key: replayKey, shown: {} });
  const shown = state.key === replayKey ? state.shown : {};

  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  });
  const progressRef = useRef<Progress>({});
  useEffect(() => {
    progressRef.current = {};
  }, [replayKey]);

  const pending = lines.some((line) => (shown[line.id] ?? 0) < line.text.length);

  useEffect(() => {
    if (!pending) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const full: Progress = {};
      for (const line of linesRef.current) full[line.id] = line.text.length;
      const timer = setTimeout(() => {
        progressRef.current = full;
        setState({ key: replayKey, shown: full });
      }, 0);
      return () => clearTimeout(timer);
    }

    let pauseUntil = 0;
    const interval = setInterval(() => {
      if (Date.now() < pauseUntil) return;
      const progress = progressRef.current;
      for (const line of linesRef.current) {
        const have = progress[line.id] ?? 0;
        if (have >= line.text.length) continue;
        const to = Math.min(line.text.length, have + CHARS_PER_TICK);
        progressRef.current = { ...progress, [line.id]: to };
        if (to === line.text.length) pauseUntil = Date.now() + LINE_PAUSE_MS;
        setState({ key: replayKey, shown: progressRef.current });
        return;
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [pending, replayKey]);

  const activeId = pending ? (lines.find((line) => (shown[line.id] ?? 0) < line.text.length)?.id ?? null) : null;
  return { shown, activeId, speaking: pending };
}
