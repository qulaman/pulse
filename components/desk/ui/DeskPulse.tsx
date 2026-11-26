"use client";

import { onlineManager, useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import { MiniMark, type MiniState } from "@/components/brand/MiniMark";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { useIngestStore } from "@/lib/store/ingest";

/** A fetch shorter than this is not shown: the live board refetches all day, the mark would never rest. */
const SHOW_AFTER_MS = 350;
/** Once shown, «работаю» stays at least this long — one step of the arcs, not a blink. */
const HOLD_MS = 900;

/** True once `on` has lasted `after` ms, and for at least `hold` ms from then. */
function useSteady(on: boolean, after: number, hold: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(on), on ? after : shown ? hold : 0);
    return () => clearTimeout(timer);
  }, [on, after, hold, shown]);
  return shown;
}

const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);

/**
 * The desk's pulse in the top bar (D-209): the mascot's small self says what the program is doing —
 * beats while everything is fresh, steps round while data is on its way or a phrase is being
 * taken apart, turns into the bars of the voice while the microphone is open, stands grey without
 * network. Nothing to press: a sign, with its words in the tooltip.
 */
export function DeskPulse() {
  const stage = useIngestStore((state) => state.stage);
  const online = useSyncExternalStore(subscribeOnline, () => onlineManager.isOnline(), () => true);
  const fetching = useIsFetching() > 0;
  const mutating = useIsMutating() > 0;
  const loading = useSteady(fetching || mutating, SHOW_AFTER_MS, HOLD_MS);
  const phrase = stage === "uploading" || stage === "transcribing" || stage === "parsing";

  const [state, words]: [MiniState, string] = !online
    ? ["still", "Нет сети — показываю сохранённое"]
    : stage === "recording"
      ? ["listening", "Слушаю"]
      : phrase
        ? ["busy", "Разбираю фразу"]
        : loading
          ? ["busy", "Обновляю данные"]
          : ["idle", "На связи — данные свежие"];

  return (
    <Tooltip label={words} side="bottom">
      <span className="flex h-8 w-8 items-center justify-center" data-testid="desk-pulse" data-state={state}>
        <MiniMark state={state} size={20} tone={online ? "var(--accent)" : "var(--text-muted)"} label={words} />
      </span>
    </Tooltip>
  );
}
