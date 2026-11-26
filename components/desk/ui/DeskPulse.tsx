"use client";

import { notifyManager, onlineManager, useIsFetching, useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import { MiniMark, type MiniState } from "@/components/brand/MiniMark";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { useIngestStore } from "@/lib/store/ingest";

/** A fetch shorter than this is not shown: the live board refetches all day, the corner would never rest. */
const FETCH_AFTER_MS = 800;
/** The person's own action shows a moment sooner — but not an instant one, which would only blink. */
const MUTATION_AFTER_MS = 200;
/** Once shown, «работаю» stays at least this long — one step of the arcs, not a blink. */
const HOLD_MS = 900;
/** The one beat of «пришло новое»: the dot's pop and its wave. */
const BEAT_MS = 900;

/** True once `on` has lasted `after` ms, and for at least `hold` ms from then. */
function useSteady(on: boolean, after: number, hold: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(on), on ? after : shown ? hold : 0);
    return () => clearTimeout(timer);
  }, [on, after, hold, shown]);
  return shown;
}

/**
 * A count of the fetches that brought something new — not the ones that came back the same. The
 * query cache keeps equal data as the very same object (structural sharing), so «new» is a changed
 * reference after a fetch; a write of our own (`setQueryData`, an optimistic update) is not news.
 * Read straight off the cache's events: no render until something really arrives.
 */
function useNews(): number {
  const queryClient = useQueryClient();
  const [news, setNews] = useState(0);
  useEffect(() => {
    const seen = new WeakMap<object, unknown>();
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success" || event.action.manual) return;
      const data = event.query.state.data;
      const known = seen.has(event.query);
      const before = seen.get(event.query);
      seen.set(event.query, data);
      // scheduled: never a state update in the middle of somebody else's render
      if (known && before !== data) notifyManager.schedule(() => setNews((n) => n + 1));
    });
  }, [queryClient]);
  return news;
}

/** One beat for a while after each `news`; a new arrival during a beat is the same beat. */
function useBeat(news: number): boolean {
  const [beat, setBeat] = useState({ news, on: false });
  if (beat.news !== news) setBeat({ news, on: true });
  useEffect(() => {
    if (!beat.on) return;
    const timer = setTimeout(() => setBeat((was) => ({ ...was, on: false })), BEAT_MS);
    return () => clearTimeout(timer);
  }, [beat.on]);
  return beat.on;
}

const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);

/**
 * The desk's pulse in the top bar (D-209): the mascot's small self says what the program is doing —
 * calmly, for somebody who sits beside it for hours. At rest it stands: no endless beat in the
 * corner of the eye. It beats once when a refresh has brought something new; steps round for the
 * person's own action and for data that takes longer than a moment, and while a phrase is being
 * taken apart; turns into the bars of the voice while the microphone is open; stands grey without
 * network. Nothing to press: a sign, with its words in the tooltip.
 */
export function DeskPulse() {
  const stage = useIngestStore((state) => state.stage);
  const online = useSyncExternalStore(subscribeOnline, () => onlineManager.isOnline(), () => true);
  const fetching = useSteady(useIsFetching() > 0, FETCH_AFTER_MS, HOLD_MS);
  const mutating = useSteady(useIsMutating() > 0, MUTATION_AFTER_MS, HOLD_MS);
  const fresh = useBeat(useNews());
  const phrase = stage === "uploading" || stage === "transcribing" || stage === "parsing";

  const [state, words]: [MiniState, string] = !online
    ? ["still", "Нет сети — показываю сохранённое"]
    : stage === "recording"
      ? ["listening", "Слушаю"]
      : phrase
        ? ["busy", "Разбираю фразу"]
        : mutating
          ? ["busy", "Сохраняю"]
          : fetching
            ? ["busy", "Обновляю данные"]
            : fresh
              ? ["done", "Пришло новое"]
              : ["still", "На связи — данные свежие"];

  return (
    <Tooltip label={words} side="bottom">
      <span className="flex h-8 w-8 items-center justify-center" data-testid="desk-pulse" data-state={state}>
        <MiniMark state={state} size={20} tone={online ? "var(--accent)" : "var(--text-muted)"} label={words} />
      </span>
    </Tooltip>
  );
}
