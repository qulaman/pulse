"use client";

import { useEffect, useMemo, useState } from "react";

import { FINISH_MS } from "@/components/secretary/SecretaryMascot";
import type { Errand } from "@/lib/errands/queries";
import { deskFocus, isQuick, justDone, justThanked, sceneOf, type DeskFocus } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";

export type DeskStage = DeskFocus & {
  /** bumped when a request the face was calling for has just been taken — «есть!» */
  acceptKey: number;
  /** bumped when the director has just said «спасибо» for this secretary's job (D-97) */
  thanksKey: number;
  /** the job being finished was closed within two minutes of the ask */
  quick: boolean;
};

/**
 * The request a secretary's face acts out (D-87, D-97), and what has just happened to it: the
 * finish after «Готово» (FINISH_MS), the nod on «Принял», the hearts of a thank-you. The
 * events are read off two consecutive lists, so they come the same way whether the tap was
 * made here or on another phone. `meId` null is the director's desk: anybody's job counts.
 * A new request nobody took cuts the finish short — somebody has to say «Принял» first.
 */
export function useDeskFocus(errands: readonly Errand[], meId: string | null, catalogue: readonly SecretaryAction[] = []): DeskStage {
  const base = useMemo(() => deskFocus(errands, meId, catalogue), [errands, meId, catalogue]);

  // the list seen last time, to tell the moves apart (adjusted during render, not in an effect)
  const [seen, setSeen] = useState(errands);
  const [finish, setFinish] = useState<Errand | null>(null);
  const [acceptKey, setAcceptKey] = useState(0);
  const [thanksKey, setThanksKey] = useState(0);
  if (seen !== errands) {
    setSeen(errands);
    const done = justDone(seen, errands, meId);
    if (done) setFinish(done);
    const was = new Map(seen.map((row) => [row.id, row.status]));
    if (errands.some((row) => row.status === "accepted" && was.get(row.id) === "sent" && (meId === null || row.claimed_by === meId))) {
      setAcceptKey((key) => key + 1);
    }
    if (meId && justThanked(seen, errands, meId)) setThanksKey((key) => key + 1);
  }
  useEffect(() => {
    if (!finish) return;
    const timer = setTimeout(() => setFinish(null), FINISH_MS);
    return () => clearTimeout(timer);
  }, [finish]);

  if (finish && base.phase !== "asked") {
    return { scene: sceneOf(finish, catalogue), phase: "done", errand: finish, queue: 0, acceptKey, thanksKey, quick: isQuick(finish) };
  }
  return { ...base, acceptKey, thanksKey, quick: false };
}
