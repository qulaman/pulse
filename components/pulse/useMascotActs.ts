"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { keepsHands } from "@/components/brand/hands";
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
 * in the meantime, an idle one is dropped the moment the face gets busy. A called act gives way
 * to a job that needs its hand: the wave of waking stops when a ball is tapped mid-wave and the
 * clipboard comes into that hand — two hands, never three (components/brand/hands.ts).
 *
 * Nothing runs per frame: one timer between acts, one to clear the act, and the act itself is
 * CSS.
 */
export function useMascotActs(
  state: MascotState,
  enabled: boolean,
  /** acts that make no sense on this screen — the wall has no balls to follow */
  skip: readonly MascotAct[] = [],
  /** the employee carries the stack of orders: a called act is drawn round it (components/brand/hands.ts) */
  holding = false,
): { act: MascotAct | null; play: (act: MascotAct) => void } {
  const [shown, setShown] = useState<{ act: MascotAct; called: boolean; on: MascotState } | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef<MascotAct | null>(null);
  // a called act must not be cut by an idle one picked while it plays
  const busyUntil = useRef(0);

  // the state the face is in when an act starts: what its hands were doing then. Kept after every
  // commit — in a layout effect, before any passive effect of the screen or its children calls `play`
  const stateNow = useRef(state);
  useLayoutEffect(() => {
    stateNow.current = state;
  });

  const show = useCallback((act: MascotAct, called: boolean) => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    last.current = act;
    busyUntil.current = Date.now() + ACT_MS[act];
    setShown({ act, called, on: stateNow.current });
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

  const pool = enabled ? POOLS[state]?.filter((act) => !skip.includes(act)) : undefined;
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
      show(act, true);
    },
    [show],
  );

  // a called act that meets a job holding its hand is over: dropped for good, so a quick turn back
  // does not bring it in again halfway through (adjusted during render — the hand leaves in the same paint)
  if (shown?.called && shown.on !== state) setShown(keepsHands(shown.act, shown.on, state, holding) ? { ...shown, on: state } : null);
  // ...and its clock goes with it: idle acts would otherwise wait out the rest of an act nobody sees
  useEffect(() => {
    if (shown || !clearTimer.current) return;
    clearTimeout(clearTimer.current);
    clearTimer.current = null;
    busyUntil.current = 0;
  }, [shown]);
  // an idle act belongs to the state it was picked for; a called one plays over anything that leaves its hands be
  const act = shown && (shown.called || (pool?.includes(shown.act) ?? false)) ? shown.act : null;
  return { act, play };
}
