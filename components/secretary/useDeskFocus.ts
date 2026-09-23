"use client";

import { useEffect, useMemo, useState } from "react";

import type { Errand } from "@/lib/errands/queries";
import { deskFocus, justDone, sceneOf, type DeskFocus } from "@/lib/errands/scene";

/** How long the secretary's face cheers after «Готово». */
const CHEER_MS = 1_800;

/**
 * The request the secretary's face acts out (D-87), plus the short cheer when one of this
 * secretary's jobs has just been closed. A new request nobody took cuts the cheer short:
 * somebody has to say «Принял» first.
 */
export function useDeskFocus(errands: readonly Errand[], meId: string): DeskFocus {
  const base = useMemo(() => deskFocus(errands, meId), [errands, meId]);

  // the list seen last time, to tell «accepted → done» by a diff (adjusted during render)
  const [seen, setSeen] = useState(errands);
  const [cheer, setCheer] = useState<Errand | null>(null);
  if (seen !== errands) {
    setSeen(errands);
    const done = justDone(seen, errands, meId);
    if (done) setCheer(done);
  }
  useEffect(() => {
    if (!cheer) return;
    const timer = setTimeout(() => setCheer(null), CHEER_MS);
    return () => clearTimeout(timer);
  }, [cheer]);

  if (cheer && base.phase !== "asked") return { scene: sceneOf(cheer), phase: "done", errand: cheer };
  return base;
}
