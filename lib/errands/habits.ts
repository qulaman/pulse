import { aqtobeDay } from "@/lib/errands/scene";
import type { SecretaryAction } from "@/lib/settings";
import { aqtobeHour } from "@/lib/voice/quietHours";

/**
 * The director's habits with the secretary's buttons (D-106 §4–6), kept in this browser:
 * what a button usually goes with («без сахара»), which buttons this part of the day asks
 * for, whether the hold is learned. Pure rules first, then a thin storage layer that
 * degrades to «no habit» wherever localStorage is missing.
 */

/** The same note this many times in a row makes it the button's usual. */
export const USUAL_AFTER = 3;
/** Sends in this part of the day before the order follows them. */
export const HABIT_MIN = 5;
/** A button moves forward once it has this much weight in the part of the day. */
const HABIT_BUTTON = 2;
/** Every send fades the older ones of its part of the day: a habit that stopped fades out. */
const FADE = 0.9;
/** Holds that went through before the line «Держать 2 секунды» is no longer needed. */
export const HOLDS_LEARNED = 8;

export type HabitPart = "morning" | "day" | "evening";

/** Morning until noon, day until five, evening after — on the Aqtobe wall clock. */
export function habitPartOf(now: Date): HabitPart {
  const hour = aqtobeHour(now);
  return hour < 12 ? "morning" : hour < 17 ? "day" : "evening";
}

/** The button's usual note: the last `USUAL_AFTER` sends all went with the same words. */
export function usualOf(history: readonly (string | null)[]): string | null {
  if (history.length < USUAL_AFTER) return null;
  const [first, ...rest] = history.slice(0, USUAL_AFTER);
  if (!first) return null;
  return rest.every((note) => note === first) ? first : null;
}

/** The history after one more send: the newest first, a blank note is «no note». */
export function withSend(history: readonly (string | null)[], note: string | null): (string | null)[] {
  return [note?.trim() || null, ...history].slice(0, USUAL_AFTER);
}

/** Weights of the buttons in each part of the day. */
export type Uses = Partial<Record<HabitPart, Record<string, number>>>;

export function countUse(uses: Uses, part: HabitPart, code: string): Uses {
  const faded = Object.fromEntries(Object.entries(uses[part] ?? {}).map(([key, weight]) => [key, weight * FADE]));
  return { ...uses, [part]: { ...faded, [code]: (faded[code] ?? 0) + 1 } };
}

/**
 * The buttons in the order of this part of the day's habit: the ones it asks for first, by
 * weight; the rest keep the catalogue's order. The alarm never moves — «Охрана» stays where
 * the catalogue put it, a place the hand must find without looking. Too little to go on — the
 * catalogue's order.
 */
export function habitOrder(
  actions: readonly SecretaryAction[],
  weights: Record<string, number> | undefined,
  isAlarm: (action: SecretaryAction) => boolean,
): SecretaryAction[] {
  const total = Object.values(weights ?? {}).reduce((sum, weight) => sum + weight, 0);
  if (!weights || total < HABIT_MIN) return [...actions];
  const weightOf = (action: SecretaryAction) => weights[action.code] ?? 0;
  const movable = actions.filter((action) => !isAlarm(action));
  const asked = movable.filter((action) => weightOf(action) >= HABIT_BUTTON).sort((a, b) => weightOf(b) - weightOf(a));
  const ordered = [...asked, ...movable.filter((action) => weightOf(action) < HABIT_BUTTON)];
  actions.forEach((action, index) => {
    if (isAlarm(action)) ordered.splice(Math.min(index, ordered.length), 0, action);
  });
  return ordered;
}

/** The catalogue in a kept order; buttons the order does not know go after, in catalogue order. */
export function applyOrder(actions: readonly SecretaryAction[], codes: readonly string[]): SecretaryAction[] {
  const rank = new Map(codes.map((code, index) => [code, index]));
  const known = actions.filter((action) => rank.has(action.code)).sort((a, b) => (rank.get(a.code) ?? 0) - (rank.get(b.code) ?? 0));
  return [...known, ...actions.filter((action) => !rank.has(action.code))];
}

/* -------------------------------------------------------------------------- */
/* This browser                                                               */
/* -------------------------------------------------------------------------- */

const LAST_KEY = "pulse.errand.last.";
const USE_KEY = "pulse.errand.use";
const ORDER_KEY = "pulse.errand.order";
const HOLDS_KEY = "pulse.errand.holds";

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // a habit not kept is a button in the catalogue's order — nothing breaks
  }
}

function historyOf(code: string): (string | null)[] {
  const raw = read(LAST_KEY + code);
  return Array.isArray(raw) ? raw.filter((note): note is string | null => note === null || typeof note === "string") : [];
}

function usesOf(): Uses {
  const raw = read(USE_KEY);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Uses) : {};
}

/** «без сахара» — what a hold of this button sends with, or nothing. */
export function usualNote(code: string): string | null {
  return usualOf(historyOf(code));
}

/** Every send, from a hold or from the sheet, teaches both habits. */
export function rememberSend(code: string, note: string | null, now: Date = new Date()): void {
  write(LAST_KEY + code, withSend(historyOf(code), note));
  write(USE_KEY, countUse(usesOf(), habitPartOf(now), code));
}

/**
 * The order of the buttons now. It is decided once per part of the day and kept until the
 * next one, so a button never jumps under a finger between two opens of the card.
 */
export function orderFor(actions: readonly SecretaryAction[], isAlarm: (action: SecretaryAction) => boolean, now: Date = new Date()): SecretaryAction[] {
  const day = aqtobeDay(now);
  const part = habitPartOf(now);
  const kept = read(ORDER_KEY) as { day?: unknown; part?: unknown; codes?: unknown } | null;
  if (kept && kept.day === day && kept.part === part && Array.isArray(kept.codes)) {
    return applyOrder(actions, kept.codes.filter((code): code is string => typeof code === "string"));
  }
  const ordered = habitOrder(actions, usesOf()[part], isAlarm);
  if (actions.length > 0) write(ORDER_KEY, { day, part, codes: ordered.map((action) => action.code) });
  return ordered;
}

export function holdsLearned(): boolean {
  const count = read(HOLDS_KEY);
  return typeof count === "number" && count >= HOLDS_LEARNED;
}

export function countHold(): void {
  const count = read(HOLDS_KEY);
  write(HOLDS_KEY, (typeof count === "number" ? count : 0) + 1);
}
