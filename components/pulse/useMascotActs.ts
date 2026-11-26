"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ACT_MS, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { actSurvives } from "@/components/brand/mark/look";

/**
 * What a face may do on its own in each resting state (D-82). A state that is not here is
 * busy — listening, reading, throwing, holding a ball's job — and is left alone.
 *
 * The sleeper's acts stay asleep: a snore, a roll, a nod that jerks it half awake for a
 * moment, a mumble, a smile at a dream, a kick at the thing chasing it in the dream. The
 * awake face, waiting for the director to pick a ball, fidgets the way someone waiting does.
 * The watchful face only looks around harder — D-70: it has no other feelings to show.
 */
const AWAKE: readonly MascotAct[] = ["wave", "wink", "hop", "spin", "whistle", "heart", "orbit", "yawn", "scan", "limber", "eyeroll", "thump"];
const POOLS: Partial<Record<MascotState, readonly MascotAct[]>> = {
  sleeping: ["snore", "turn", "doze", "mumble", "smile", "kick", "yawn"],
  calm: AWAKE,
  happy: AWAKE,
  alert: ["peek", "tiptoe"],
  // the employee's face with work in its hands (D-110): a look at the watch, the brow wiped,
  // a card gone through, a tune, a wink — somebody busy, not somebody waiting
  working: ["watch", "wipe", "shuffle", "whistle", "wink"],
  // everything is with the director: it looks around, stretches to see, checks the time
  awaiting: ["peek", "tiptoe", "watch", "whistle", "eyeroll", "scan"],
};

/** The first act comes a few seconds after the face settles into its state. */
const FIRST_MS: [number, number] = [3_500, 6_500];
/** Between two acts: long enough that the rest is still rest, short enough to be noticed. */
const GAP_MS: [number, number] = [6_000, 12_000];
/**
 * A face left alone calms down (2026-11-26): every act stretches the pause after it by this much, up
 * to `GAP_MAX_MS`; a touch anywhere brings it back to the first pause.
 */
const GAP_GROWTH = 1.25;
const GAP_MAX_MS = 25_000;

/**
 * The big gestures of a face at rest — a jump, a turn, a heart, a tune, a strong beat. Everything else
 * of a pool is small (a glance, a wink, a look round) and comes three times as often: a face that
 * jumps every other time is restless, not resting.
 */
const BIG: ReadonlySet<MascotAct> = new Set(["hop", "spin", "heart", "whistle", "thump"]);
const SMALL_WEIGHT = 3;

const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);

/** Any act of the pool but the one just played (a face that yawns twice in a row is broken), small ones three times as likely. */
export function pick(pool: readonly MascotAct[], last: MascotAct | null, random: () => number = Math.random): MascotAct {
  const choices = pool.length > 1 ? pool.filter((act) => act !== last) : pool;
  const weight = (act: MascotAct) => (BIG.has(act) ? 1 : SMALL_WEIGHT);
  const total = choices.reduce((sum, act) => sum + weight(act), 0);
  let at = random() * total;
  for (const act of choices) {
    at -= weight(act);
    if (at < 0) return act;
  }
  return choices[choices.length - 1]!;
}

/** The pause after the `n`-th act in a row with no touch: the usual one, stretched, never past the cap. */
export function restGap(base: number, n: number): number {
  return Math.min(GAP_MAX_MS, base * GAP_GROWTH ** n);
}

/**
 * The acts of a face at rest (D-82): every few seconds, one of the small things its state
 * allows, then back to the state. `play` calls one on purpose — the screen waves when the
 * face wakes and yawns when it dozes off; a called act plays over whatever the face turns to
 * in the meantime, an idle one is dropped the moment the face gets busy. A called act gives way
 * to a ball's work and to a phrase: the wave of waking stops when a ball is tapped mid-wave and the
 * dot becomes that ball's thing — the dot is one (components/brand/mark/look.ts).
 *
 * Nothing runs per frame: one timer between acts, one to clear the act, and the act itself is
 * CSS.
 */
export function useMascotActs(
  state: MascotState,
  enabled: boolean,
  /** acts that make no sense on this screen — the wall has no balls to follow */
  skip: readonly MascotAct[] = [],
): { act: MascotAct | null; play: (act: MascotAct) => void } {
  const [shown, setShown] = useState<{ act: MascotAct; called: boolean; on: MascotState } | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef<MascotAct | null>(null);
  // a called act must not be cut by an idle one picked while it plays
  const busyUntil = useRef(0);
  // an act is on the face right now (mirrors `shown`, read by `show` without a render)
  const showing = useRef(false);
  // the two frames an act replacing another waits for: the face must be drawn once without it
  const frames = useRef<number | null>(null);
  // acts played in a row with nobody touching the screen: each stretches the pause after it
  const calmed = useRef(0);

  // the state the face is in when an act starts. Kept after every
  // commit — in a layout effect, before any passive effect of the screen or its children calls `play`
  const stateNow = useRef(state);
  useLayoutEffect(() => {
    stateNow.current = state;
  });

  const show = useCallback((act: MascotAct, called: boolean) => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = null;
    if (frames.current !== null) cancelAnimationFrame(frames.current);
    frames.current = null;
    last.current = act;
    busyUntil.current = Date.now() + ACT_MS[act];
    const put = () => {
      frames.current = null;
      busyUntil.current = Date.now() + ACT_MS[act];
      showing.current = true;
      setShown({ act, called, on: stateNow.current });
      clearTimer.current = setTimeout(() => {
        clearTimer.current = null;
        showing.current = false;
        setShown(null);
      }, ACT_MS[act]);
    };
    if (!showing.current) {
      put();
      return;
    }
    // An act over one still playing — the same one twice above all — would hand the face the same
    // CSS animation string, and a browser does not restart an animation whose name has not changed:
    // the second «pinch» never played. The face is drawn one frame without an act, then the new one
    // starts from its first frame. Two frames: the first may come before React has drawn the gap.
    showing.current = false;
    setShown(null);
    frames.current = requestAnimationFrame(() => {
      frames.current = requestAnimationFrame(put);
    });
  }, []);

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
      if (frames.current !== null) cancelAnimationFrame(frames.current);
    },
    [],
  );

  // a touch anywhere: somebody is here, the face is as lively as at first
  useEffect(() => {
    const touched = () => {
      calmed.current = 0;
    };
    window.addEventListener("pointerdown", touched, { passive: true });
    return () => window.removeEventListener("pointerdown", touched);
  }, []);

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
        next(ACT_MS[act] + restGap(between(GAP_MS), calmed.current));
        calmed.current += 1;
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

  // a called act that meets a ball's work or a phrase is over: dropped for good, so a quick turn back
  // does not bring it in again halfway through (adjusted during render — the thing changes in the same paint)
  if (shown?.called && shown.on !== state) setShown(actSurvives(state) ? { ...shown, on: state } : null);
  // ...and its clock goes with it: idle acts would otherwise wait out the rest of an act nobody sees
  // (not the gap of an act replacing another: no clock is set while its two frames run)
  useEffect(() => {
    if (shown || !clearTimer.current) return;
    clearTimeout(clearTimer.current);
    clearTimer.current = null;
    showing.current = false;
    busyUntil.current = 0;
  }, [shown]);
  // an idle act belongs to the state it was picked for; a called one plays over anything that leaves its hands be
  const act = shown && (shown.called || (pool?.includes(shown.act) ?? false)) ? shown.act : null;
  return { act, play };
}
