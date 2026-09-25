/**
 * The mascots' animations hold together (D-119): every animation a face names exists in the CSS,
 * no keyframes are declared twice (the later copy silently wins — a refined «думает» was lost that
 * way), and an act's own motion ends within the act, because the screen clears the act after
 * ACT_MS and whatever is still playing is cut mid-gesture. The faces are rendered to markup, so
 * the check reads exactly what the browser gets.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ACT_MS, ACT_TOUCH, Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { SEC_ACT_MS, SecretaryMascot, type SecretaryAct } from "@/components/secretary/SecretaryMascot";
import { DESK_SCENES, type DeskPhase } from "@/lib/errands/scene";

const CSS = ["app/globals.css", "components/secretary/secretary-mascot.css"].map((file) => readFileSync(join(process.cwd(), file), "utf8")).join("\n");
const DECLARED = [...CSS.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]!);

/** Every state, checked for exhaustiveness by the type. */
const STATES: Record<MascotState, true> = {
  calm: true, listening: true, saving: true, transcribing: true, parsing: true, sending: true, offering: true,
  thinking: true, speaking: true, happy: true, sleeping: true, surprised: true, processing: true, calling: true,
  alert: true, angry: true, nervous: true, bored: true, panicking: true, swearing: true, checking: true,
  chatting: true, announcing: true, scheduling: true, serving: true, celebrating: true, working: true,
  awaiting: true, tuned: true,
};
const CARRY: Partial<Record<MascotState, { count: number; hot?: boolean }>> = { working: { count: 3 }, panicking: { count: 2, hot: true }, calling: { count: 1 }, nervous: { count: 1 } };

type Anim = { name: string; value: string; duration: number; delay: number; iterations: number };

/** The `animation:` shorthands in a piece of markup, parsed: name, seconds, iterations. */
function animationsOf(markup: string): Anim[] {
  const out: Anim[] = [];
  for (const match of markup.matchAll(/(?:^|[;"])animation:([^;"]+)/g)) {
    const value = match[1]!.trim();
    if (value === "none") continue;
    const tokens = value.replace(/\([^)]*\)/g, "").split(/\s+/);
    const times = tokens.filter((token) => /^[\d.]+m?s$/.test(token)).map((token) => (token.endsWith("ms") ? parseFloat(token) / 1000 : parseFloat(token)));
    const count = tokens.find((token) => token === "infinite" || /^\d+$/.test(token));
    out.push({ name: tokens[0]!, value, duration: times[0] ?? 0, delay: times[1] ?? 0, iterations: count === "infinite" ? Infinity : Number(count ?? 1) });
  }
  return out;
}

const drop = (state: MascotState, act: MascotAct | null = null, carry = CARRY[state] ?? null) =>
  renderToStaticMarkup(createElement(Mascot, { state, act, carry, size: 96 }));
const secretary = (props: { scene?: (typeof DESK_SCENES)[number] | null; phase: DeskPhase; act?: SecretaryAct | null; mini?: boolean; still?: boolean }) =>
  renderToStaticMarkup(createElement(SecretaryMascot, { scene: props.scene ?? null, phase: props.phase, act: props.act ?? null, mini: props.mini, still: props.still, size: 128 }));

/** Everything the faces can draw, as markup. */
function allMarkup(): string[] {
  const out: string[] = [];
  for (const state of Object.keys(STATES) as MascotState[]) {
    out.push(drop(state), renderToStaticMarkup(createElement(Mascot, { state, size: 96, season: "new_year" })));
    for (const act of Object.keys(ACT_MS) as MascotAct[]) out.push(drop(state, act));
  }
  for (const phase of ["rest", "asked", "doing", "done"] as DeskPhase[]) {
    for (const scene of DESK_SCENES) {
      out.push(secretary({ scene, phase }), secretary({ scene, phase, mini: true }));
    }
  }
  for (const act of Object.keys(SEC_ACT_MS) as SecretaryAct[]) out.push(secretary({ phase: "rest", act }));
  out.push(secretary({ phase: "rest", still: true }));
  return out;
}

describe("mascot keyframes", () => {
  it("declares every keyframes block once", () => {
    const seen = new Set<string>();
    const twice = DECLARED.filter((name) => (seen.has(name) ? true : (seen.add(name), false)));
    expect(twice).toEqual([]);
  });

  it("has keyframes for every animation a face names", () => {
    const named = new Set(allMarkup().flatMap((markup) => animationsOf(markup).map((anim) => anim.name)));
    const declared = new Set(DECLARED);
    expect([...named].filter((name) => !declared.has(name))).toEqual([]);
  });
});

/** An act's own motion — what the act adds to the face — ends by the time the act is cleared. */
function overruns(base: string, withAct: string, ms: number): string[] {
  const before = new Set(animationsOf(base).map((anim) => anim.value));
  return animationsOf(withAct)
    .filter((anim) => !before.has(anim.value) && anim.iterations !== Infinity)
    .filter((anim) => (anim.delay + anim.duration * anim.iterations) * 1000 > ms + 40)
    .map((anim) => `${anim.value} ends at ${Math.round((anim.delay + anim.duration * anim.iterations) * 1000)} ms of ${ms}`);
}

describe("acts end within their length", () => {
  it("«Капля» and the employee's face", () => {
    const late: string[] = [];
    for (const act of Object.keys(ACT_MS) as MascotAct[]) {
      for (const state of ["calm", "sleeping", "working", "calling", "happy", "awaiting", "alert", "nervous", "tuned"] as MascotState[]) {
        late.push(...overruns(drop(state), drop(state, act), ACT_MS[act]).map((line) => `${act} on ${state}: ${line}`));
      }
    }
    expect(late).toEqual([]);
  });

  it("the secretary at the desk", () => {
    const late: string[] = [];
    const base = secretary({ phase: "rest" });
    for (const act of Object.keys(SEC_ACT_MS) as SecretaryAct[]) {
      late.push(...overruns(base, secretary({ phase: "rest", act }), SEC_ACT_MS[act]).map((line) => `${act}: ${line}`));
    }
    expect(late).toEqual([]);
  });

  it("an act's touch comes while the act is playing", () => {
    for (const [act, touch] of Object.entries(ACT_TOUCH) as [MascotAct, [number, number | number[]]][]) {
      expect(touch[0]).toBeLessThan(ACT_MS[act]);
    }
  });
});
