"use client";

import { useEffect, useState } from "react";

import { MiniMark, type MiniState } from "@/components/brand/MiniMark";
import type { IngestStage } from "@/lib/store/ingest";

/** How long the one beat of «отправлено» stays before the icon stands again: the pop and its wave. */
const DONE_MS = 900;

/** What the director's phrase is doing, as the small mark says it; null — nothing in flight. */
function phraseState(stage: IngestStage): MiniState | null {
  if (stage === "recording") return "listening";
  if (stage === "uploading" || stage === "transcribing" || stage === "parsing" || stage === "sending") return "busy";
  return null;
}

/**
 * The icon of the «Пульс» tab (D-209): the mascot's small self says what is going on instead of
 * beating forever. On Пульс itself it stands — the big mark is right there. Elsewhere: the voice
 * while a recording runs, at work while a phrase is in flight, one beat when the phrase has gone,
 * a hop while the tab has something waiting (`count`), and otherwise it stands.
 *
 * Its own component with its own subscription: a stage of the phrase re-renders this icon, not
 * the whole tab bar. The phrase's store is the director's (`voice`) and is fetched on its own: every
 * screen with a «Назад» imports the tab bar (PageHead → backTarget), and the voice pipeline must
 * not ride along into all of them.
 */
export function TabMark({ here, count, voice }: { here: boolean; count: number; voice: boolean }) {
  const [phrase, setPhrase] = useState<MiniState | null>(null);
  // the phrase has gone (the pipeline reached «done»): one beat, keyed so a second send beats again
  const [sent, setSent] = useState(0);
  const [beating, setBeating] = useState(false);
  useEffect(() => {
    if (!voice) return;
    let gone = false;
    let off: (() => void) | undefined;
    void import("@/lib/store/ingest").then(({ useIngestStore }) => {
      if (gone) return;
      setPhrase(phraseState(useIngestStore.getState().stage));
      off = useIngestStore.subscribe((state, was) => {
        if (state.stage === was.stage) return;
        setPhrase(phraseState(state.stage));
        if (state.stage !== "done") return;
        setSent((n) => n + 1);
        setBeating(true);
      });
    });
    return () => {
      gone = true;
      off?.();
    };
  }, [voice]);
  useEffect(() => {
    if (!beating) return;
    const timer = setTimeout(() => setBeating(false), DONE_MS);
    return () => clearTimeout(timer);
  }, [beating, sent]);

  const state: MiniState = here ? "still" : (phrase ?? (beating ? "done" : count > 0 ? "alert" : "still"));
  // at work in the product's colour; standing or calling, it takes the tab's own (muted, or accent when chosen)
  const tone = state === "still" || state === "alert" ? undefined : "var(--accent)";
  return <MiniMark key={state === "done" ? `done-${sent}` : "mark"} state={state} size={24} tone={tone} />;
}
