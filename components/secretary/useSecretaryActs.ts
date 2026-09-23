"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { SEC_ACT_MS, type SecretaryAct } from "@/components/secretary/SecretaryMascot";
import { aqtobeDay, type Daypart } from "@/lib/errands/scene";

/** What the secretary does at the desk while nobody asks (D-97); the evening is a tired one. */
const DAY: readonly SecretaryAct[] = ["sip", "headset", "stretch", "clock", "papers", "plant"];
const EVENING: readonly SecretaryAct[] = ["stretch", "sip", "clock", "stretch", "headset"];

/** The first act a few seconds after the desk settles; then one every 20–40 s. */
const FIRST_MS: [number, number] = [4_000, 8_000];
const GAP_MS: [number, number] = [20_000, 40_000];
const ARRIVED_KEY = "pulse.secretary.arrived";

const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);

function pick(pool: readonly SecretaryAct[], last: SecretaryAct | null): SecretaryAct {
  const choices = pool.filter((act) => act !== last);
  return choices[Math.floor(Math.random() * choices.length)] ?? pool[0]!;
}

/** Once a day the morning desk starts with the arrival; the mark lives in this browser only. */
function arrivedToday(today: string): boolean {
  try {
    if (window.localStorage.getItem(ARRIVED_KEY) === today) return true;
    window.localStorage.setItem(ARRIVED_KEY, today);
    return false;
  } catch {
    return true;
  }
}

/**
 * The one-shots of the secretary's face (D-97). Called ones — «есть!» when a request is taken
 * (`acceptKey`), the hearts of a thank-you (`thanksKey`) — play whenever their key moves. Idle
 * ones play only at rest (`idle`): every 20–40 s a small thing at the desk, the first morning
 * visit begins with the arrival. Under prefers-reduced-motion there are no idle acts; the
 * called ones still show, their keyframes are cut by the global rule.
 */
export function useSecretaryActs({
  idle,
  daypart,
  acceptKey,
  thanksKey,
}: {
  idle: boolean;
  daypart: Daypart;
  acceptKey: number;
  thanksKey: number;
}): SecretaryAct | null {
  const reduced = useReducedMotion() === true;

  // called acts: a key that moved since the last render starts its act (adjusted during render)
  const [keys, setKeys] = useState({ acceptKey, thanksKey });
  const [called, setCalled] = useState<{ act: SecretaryAct; n: number } | null>(null);
  if (keys.acceptKey !== acceptKey || keys.thanksKey !== thanksKey) {
    setKeys({ acceptKey, thanksKey });
    setCalled({ act: thanksKey !== keys.thanksKey ? "thanks" : "accept", n: acceptKey + thanksKey });
  }
  useEffect(() => {
    if (!called) return;
    const timer = setTimeout(() => setCalled(null), SEC_ACT_MS[called.act]);
    return () => clearTimeout(timer);
  }, [called]);

  // idle acts: one timer between acts, one to clear the act; nothing runs per frame
  const [shown, setShown] = useState<SecretaryAct | null>(null);
  const last = useRef<SecretaryAct | null>(null);
  const on = idle && daypart !== "night" && !reduced;
  const pool = daypart === "evening" ? EVENING : DAY;
  const poolKey = on ? pool.join(",") : "";
  const morning = daypart === "morning";
  useEffect(() => {
    if (!poolKey) return;
    const acts = poolKey.split(",") as SecretaryAct[];
    let wait: ReturnType<typeof setTimeout>;
    let clear: ReturnType<typeof setTimeout>;
    const play = (act: SecretaryAct) => {
      last.current = act;
      setShown(act);
      clear = setTimeout(() => {
        setShown(null);
        wait = setTimeout(() => play(pick(acts, last.current)), between(GAP_MS));
      }, SEC_ACT_MS[act]);
    };
    const first = morning && !arrivedToday(aqtobeDay(new Date())) ? "arrive" : null;
    wait = setTimeout(() => play(first ?? pick(acts, last.current)), first ? 300 : between(FIRST_MS));
    return () => {
      clearTimeout(wait);
      clearTimeout(clear);
      // a desk that got busy drops the act it was in; the next rest starts clean
      setShown(null);
    };
  }, [poolKey, morning]);

  return called?.act ?? (on ? shown : null);
}
