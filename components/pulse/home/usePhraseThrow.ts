"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useIngestStore } from "@/lib/store/ingest";

import { CHEER_MS } from "./stage";

/** One full swing of `mascot-throw`: the face keeps throwing even if the server was faster. */
const THROW_MS = 1200;

/**
 * The face throwing the phrase in hand and its joy once the batch has landed (D-60 sixth, D-82).
 * The send answers in ~0.5 s, the throw takes 1.2 s: without holding the swing to its end the face
 * froze mid wind-up and the card never left the hand. The batch has landed (the store went from
 * «sending» to done): the face celebrates — after the swing, never over it. A failed send goes to
 * «error» and gets no confetti. `startThrow` keeps its identity for the screen's life.
 */
export function usePhraseThrow(): { throwing: boolean; cheering: boolean; startThrow: () => void } {
  const [throwing, setThrowing] = useState(false);
  const throwTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throwEndsAt = useRef(0);
  const [cheering, setCheering] = useState(false);
  const cheerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = useIngestStore.subscribe((current, previous) => {
      if (previous.stage !== "sending" || (current.stage !== "done" && current.stage !== "idle")) return;
      if (cheerTimer.current) clearTimeout(cheerTimer.current);
      cheerTimer.current = setTimeout(
        () => {
          setCheering(true);
          cheerTimer.current = setTimeout(() => setCheering(false), CHEER_MS);
        },
        Math.max(0, throwEndsAt.current - Date.now()),
      );
    });
    return () => {
      unsubscribe();
      if (throwTimer.current) clearTimeout(throwTimer.current);
      if (cheerTimer.current) clearTimeout(cheerTimer.current);
    };
  }, []);
  const startThrow = useCallback(() => {
    setThrowing(true);
    throwEndsAt.current = Date.now() + THROW_MS;
    if (throwTimer.current) clearTimeout(throwTimer.current);
    throwTimer.current = setTimeout(() => setThrowing(false), THROW_MS);
  }, []);
  return { throwing, cheering, startThrow };
}
