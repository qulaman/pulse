"use client";

import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

import { ACT_MS, type MascotAct, type MascotState } from "@/components/brand/Mascot";

/**
 * What a face may do on its own in each resting state (D-82). A state that is not here is
 * busy — listening, reading, throwing, holding a ball's job — and is left alone.
 *
 * The sleeper's acts stay asleep: a snore, a roll, a nod that jerks it half awake for a
 * moment, a mumble, a smile at a dream, a kick at the thing chasing it in the dream. The
 * awake face, waiting for the director to pick a ball, fidgets the way someone waiting does.
 * The watchful face only looks around harder — D-70: it has no other feelings to show.
 */
const AWAKE: readonly MascotAct[] = ["wave", "wink", "hop", "spin", "whistle", "heart", "orbit", "yawn"];
const POOLS: Partial<Record<MascotState, readonly MascotAct[]>> = {
  sleeping: ["snore", "turn", "doze", "mumble", "smile", "kick", "yawn"],
  calm: AWAKE,
  happy: AWAKE,
  alert: ["peek", "tiptoe"],
  // the employee's face with work in its hands (D-110): a look at the watch, the brow wiped,
  // a card gone through, a tune, a wink — somebody busy, not somebody waiting
  working: ["watch", "wipe", "shuffle", "whistle", "wink"],
  // everything is with the director: it looks around, stretches to see, checks the time
  awaiting: ["peek", "tiptoe", "watch", "whistle"],
};

/** The first act comes a few seconds after the face settles into its state. */
const FIRST_MS: [number, number] = [3_500, 6_500];
/** Between two acts: long enough that the rest is still rest, short enough to be noticed. */
const GAP_MS: [number, number] = [6_000, 12_000];

const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);

/** Any act of the pool but the one just played: a face that yawns twice in a row is broken. */
function pick(pool: readonly MascotAct[], last: MascotAct | null): MascotAct {
  const choices = pool.length > 1 ? pool.filter((act) => act !== last) : pool;
  return choices[Math.floor(Math.random() * choices.length)]!;
}

/**
 * The acts of a face at rest (D-82): every few seconds, one of the small things its state
 * allows, then back to the state. `play` calls one on purpose — the screen waves when the
 * face wakes and yawns when it dozes off; a called act plays over whatever the face turns to
 * in the meantime, an idle one is dropped the moment the face gets busy.
 *
 * Nothing runs per frame: one timer between acts, one to clear the act, and the act itself is
 * CSS. Under prefers-reduced-motion there are no acts at all — they carry no information.
 */
export function useMascotActs(
  state: MascotState,
  enabled: boolean,
  /** acts that make no sense on this screen — the wall has no balls to follow */
  skip: readonly MascotAct[] = [],
): { act: MascotAct | null; play: (act: MascotAct) => void } {
  const reduced = useReducedMotion() === true;
  const [shown, setShown] = useState<{ act: MascotAct; called: boolean } | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef<MascotAct | null>(null);
  // a called act must not be cut by an idle one picked while it plays
  const busyUntil = useRef(0);

  const show = useCallback((act: MascotAct, called: boolean) => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    last.current = act;
    busyUntil.current = Date.now() + ACT_MS[act];
    setShown({ act, called });
    clearTimer.current = setTimeout(() => {
      clearTimer.current = null;
      setShown(null);
    }, ACT_MS[act]);
  }, []);

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    [],
  );

  const pool = enabled && !reduced ? POOLS[state]?.filter((act) => !skip.includes(act)) : undefined;
  // calm and happy share one pool: going from one to the other does not restart the wait
  const poolKey = pool?.join(",") ?? "";

  useEffect(() => {
    if (!poolKey) return;
    const acts = poolKey.split(",") as MascotAct[];
    let timer: ReturnType<typeof setTimeout>;
    const next = (delay: number) => {
      timer = setTimeout(() => {
        const wait = busyUntil.current - Date.now();
        // a hidden tab has nobody to show it to; a called act is still playing — wait it out
        if (document.hidden || wait > 0) {
          next(Math.max(wait, 0) + between([1_500, 3_000]));
          return;
        }
        const act = pick(acts, last.current);
        show(act, false);
        next(ACT_MS[act] + between(GAP_MS));
      }, delay);
    };
    next(between(FIRST_MS));
    return () => clearTimeout(timer);
  }, [poolKey, show]);

  const play = useCallback(
    (act: MascotAct) => {
      if (!reduced) show(act, true);
    },
    [reduced, show],
  );

  // an idle act belongs to the state it was picked for; a called one plays over anything
  const act = shown && (shown.called || (pool?.includes(shown.act) ?? false)) ? shown.act : null;
  return { act, play };
}
