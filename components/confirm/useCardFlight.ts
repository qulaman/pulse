"use client";

import { useEffect, useRef } from "react";

import { flyAway } from "@/lib/ui/flyAway";

/**
 * The cards of a phrase fly up off the screen the moment the batch goes (D-166) — on Пульс and on
 * /confirm alike. `root` goes on an ancestor of `ConfirmList`; `fly` takes, per card, whether it
 * goes. The cards that flew stay hidden in place until the batch lands and the list unmounts; a
 * send that comes back with an error shows them again where they were.
 */
export function useCardFlight(sending: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const restore = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (sending) return;
    restore.current?.();
    restore.current = null;
  }, [sending]);
  useEffect(() => () => restore.current?.(), []);

  /** Sends the copies of the cards marked `true` up and off; returns how to show the cards again. */
  const fly = (goes: boolean[]): (() => void) => {
    const list = root.current?.querySelector<HTMLElement>("[data-entity-list]");
    const cards = list ? (Array.from(list.children) as HTMLElement[]) : [];
    restore.current?.();
    const back = flyAway(cards.filter((_, index) => goes[index] === true));
    restore.current = back;
    return back;
  };

  return { root, fly };
}
