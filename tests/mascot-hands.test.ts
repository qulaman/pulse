/**
 * Two hands, never three (components/brand/hands.ts): whatever an act reaches for, a face never draws
 * a hand that its job is holding — the act goes to the free side, puts the pencil or the steadying
 * mitten down, or is done one-handed; and a called act that a job would make jump sides is let go.
 */
import { describe, expect, it } from "vitest";

import { ACT_HANDS, gripsOf, holdsHands, keepsHands, planHands, type Side } from "@/components/brand/hands";
import { ACT_MS, type MascotAct, type MascotState } from "@/components/brand/Mascot";

const other = (side: Side): Side => (side === "left" ? "right" : "left");
const ACTS = Object.keys(ACT_MS) as MascotAct[];
/** The faces that hold something: the jobs of the balls, and the employee's stack on a resting face. */
const HOLDERS: [MascotState, boolean][] = [
  ["checking", false],
  ["announcing", false],
  ["scheduling", false],
  ["serving", false],
  ["working", true],
  ["calling", true],
];

/** The sides an act's hands end up on, after the plan (the clipboard's card acts need none or the pencil hand). */
function handsUsed(act: MascotAct, state: MascotState, holding: boolean): Side[] {
  const board = state === "checking";
  const plan = planHands(act, gripsOf(state, holding), board);
  const boardNeed: Partial<Record<MascotAct, Side | null>> = { receive: null, flick: "left", crumple: "left", stamp: "left", reply: "left", push: "left" };
  const need = board && act in boardNeed ? boardNeed[act] : ACT_HANDS[act];
  if (!need) return [];
  if (need === "left" || need === "right") return [plan.mirror ? other(need) : need];
  return plan.only ? [plan.only] : ["left", "right"];
}

describe("two hands, never three", () => {
  it("no act moves a hand its job is holding", () => {
    const clashes: string[] = [];
    for (const [state, holding] of HOLDERS) {
      const grips = gripsOf(state, holding);
      for (const act of ACTS) {
        const plan = planHands(act, grips, state === "checking");
        const held = (["left", "right"] as const).filter((side) => grips[side] && plan.letGo !== side);
        const used = handsUsed(act, state, holding);
        for (const side of used) if (held.includes(side)) clashes.push(`${act} on ${state}: ${side}`);
        // only what can be put down is put down
        if (plan.letGo) expect(grips[plan.letGo], `${act} on ${state}`).toBe("loose");
      }
    }
    expect(clashes).toEqual([]);
  });

  it("a face with free hands draws every act as it is", () => {
    for (const state of ["calm", "happy", "chatting", "tuned", "sleeping", "alert"] as MascotState[]) {
      for (const act of ACTS) expect(planHands(act, gripsOf(state, false), false)).toEqual({ mirror: false, only: null, letGo: null });
    }
  });

  it("puts the hands where the jobs leave them free", () => {
    const on = (act: MascotAct, state: MascotState, holding = false) => planHands(act, gripsOf(state, holding), state === "checking");
    // «Задачи»: the clipboard stays in the right hand, the pencil goes down
    expect(on("wave", "checking")).toEqual({ mirror: true, only: null, letGo: "left" });
    expect(on("signal", "checking")).toEqual({ mirror: false, only: null, letGo: "left" });
    expect(on("ear", "checking")).toEqual({ mirror: true, only: null, letGo: "left" });
    expect(on("receive", "checking")).toEqual({ mirror: false, only: null, letGo: null });
    // «Эфир»: the megaphone stays in the right fist
    expect(on("receive", "announcing")).toEqual({ mirror: true, only: null, letGo: null });
    expect(on("push", "announcing")).toEqual({ mirror: false, only: "left", letGo: null });
    // «Календарь»: the calendar stays up in the left hand
    expect(on("clock", "scheduling")).toEqual({ mirror: true, only: null, letGo: null });
    expect(on("scratch", "scheduling")).toEqual({ mirror: true, only: null, letGo: null });
    expect(on("stamp", "scheduling")).toEqual({ mirror: true, only: "right", letGo: null });
    // the cup: the left mitten lets go
    expect(on("ear", "serving")).toEqual({ mirror: true, only: null, letGo: "left" });
    // the employee's stack (D-110): the wave and the shrug as they always were
    expect(on("wave", "working", true)).toEqual({ mirror: true, only: null, letGo: null });
    expect(on("shrug", "working", true)).toEqual({ mirror: false, only: "left", letGo: null });
  });

  it("the pencil goes down for the board acts that need a hand (tasks/020)", () => {
    const down = ACTS.filter((act) => planHands(act, gripsOf("checking", false), true).letGo === "left");
    for (const act of ["hmm", "stamp", "flick", "crumple", "push", "clock", "reply"] as MascotAct[]) expect(down).toContain(act);
    expect(down).not.toContain("receive");
    expect(down).not.toContain("tick");
  });

  it("a job keeps its hands from the stack", () => {
    expect(holdsHands("checking")).toBe(true);
    expect(holdsHands("chatting")).toBe(false);
    expect(gripsOf("checking", true)).toEqual(gripsOf("checking", false));
  });
});

describe("a called act and a job (F1: the wave of waking meets the clipboard)", () => {
  it("is let go when the job would make its hand jump sides", () => {
    expect(keepsHands("wave", "calm", "checking")).toBe(false);
    expect(keepsHands("wave", "calm", "announcing")).toBe(false);
    expect(keepsHands("hmm", "checking", "calm")).toBe(false);
    // the card in the hand would land on the clipboard
    expect(keepsHands("receive", "calm", "checking")).toBe(false);
  });

  it("plays on when nothing jumps", () => {
    expect(keepsHands("wave", "calm", "happy")).toBe(true);
    expect(keepsHands("wave", "sleeping", "calm")).toBe(true);
    expect(keepsHands("wave", "calm", "scheduling")).toBe(true);
    expect(keepsHands("yawn", "calm", "checking")).toBe(true);
    // the pencil goes down and the hand stays where it is
    expect(keepsHands("scratch", "calm", "checking")).toBe(true);
  });

  it("knows the employee's stack: a wave mirrored for it would jump back when a job puts the stack away", () => {
    expect(keepsHands("wave", "calm", "scheduling", true)).toBe(false);
    // a job that holds no hand keeps the stack in the right one: the wave stays mirrored
    expect(keepsHands("wave", "calm", "chatting", true)).toBe(true);
  });
});
