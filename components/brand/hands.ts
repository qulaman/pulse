import type { MascotAct, MascotState } from "@/components/brand/Mascot";

/**
 * Two hands, never three (docs/DESIGN.md §3 «Руки и реквизит»): one table of what the jobs hold and
 * what the acts reach for, and the one rule that puts an act's hand where a hand is free. Sides are
 * the screen's: `left` is the side of the small x of the 64-box.
 */
export type Side = "left" | "right";

/**
 * What an act does with the hands, as it is drawn: one hand on a side; `pair` — the same gesture with
 * both (palms up, two fists), one of them can go; `both` — two different jobs on the left of the body
 * (the card held and the stamp on it, the note held and the pen), with one hand it is the tool alone.
 * An act that is not here moves no hand (a hop, a card that drops on the crown, the ear of the radio).
 */
export const ACT_HANDS: Partial<Record<MascotAct, Side | "pair" | "both">> = {
  wave: "right",
  hmm: "right",
  receive: "right",
  flick: "right",
  crumple: "right",
  ear: "right",
  pinch: "right",
  handover: "right",
  raise: "left",
  thumb: "left",
  watch: "left",
  wipe: "left",
  clock: "left",
  scratch: "left",
  signal: "left",
  shrug: "pair",
  poof: "pair",
  push: "pair",
  stamp: "both",
  reply: "both",
};

/**
 * On the clipboard of «Задачи» a card act needs no hand to hold the card — it lies on the board — and
 * whatever is done to it is done by the pencil hand reaching over: the card handed in is read off the
 * board, the stamp, the flick, the crumple, the note and the push are the left hand's (tasks/020).
 */
const ON_BOARD: Partial<Record<MascotAct, Side | null>> = {
  receive: null,
  flick: "left",
  crumple: "left",
  stamp: "left",
  reply: "left",
  push: "left",
};

/** How a job holds a hand: `fixed` — the prop is the job (the clipboard, the megaphone); `loose` — it can be put down for an act (the pencil, the mitten that steadies the saucer). */
type Grip = "fixed" | "loose";
export type Grips = { readonly left?: Grip; readonly right?: Grip };

/**
 * What each job of an open ball holds (D-82): the clipboard in the right hand and the pencil in the
 * left; the megaphone's grip in the right fist; the calendar up in the left; the saucer carried in the
 * right with the left mitten under it. `chatting`, `tuned` and `happy` hold nothing.
 */
const JOB_GRIPS: Partial<Record<MascotState, Grips>> = {
  checking: { right: "fixed", left: "loose" },
  announcing: { right: "fixed" },
  scheduling: { left: "fixed" },
  serving: { right: "fixed", left: "loose" },
};

/** The hands a face holds: its job's, or the employee's stack in the right hand (D-110). */
export function gripsOf(state: MascotState, holding: boolean): Grips {
  return JOB_GRIPS[state] ?? (holding ? { right: "fixed" } : {});
}

/** Whether a job keeps its hands for itself — the stack of orders is not carried with it. */
export function holdsHands(state: MascotState): boolean {
  return JOB_GRIPS[state] !== undefined;
}

export type HandPlan = {
  /** the act is drawn the other way round (x → 64 − x): its hand on the free side */
  readonly mirror: boolean;
  /** a two-handed act done with one hand: the side of that hand on the screen, after the mirror */
  readonly only: Side | null;
  /** the job's hand that puts its prop down for the act: the pencil, the steadying mitten */
  readonly letGo: Side | null;
};

const AS_DRAWN: HandPlan = { mirror: false, only: null, letGo: null };
const other = (side: Side): Side => (side === "left" ? "right" : "left");

/**
 * Where an act's hands go on a face that holds `grips`. A hand the job holds is not used: the act is
 * drawn on the free side; with no free side, a loose hand puts its prop down for the act's length; a
 * two-handed act keeps the one hand there is. `board` — the face holds the clipboard of «Задачи»: the
 * card acts are done on it (ON_BOARD).
 */
export function planHands(act: MascotAct | null, grips: Grips, board = false): HandPlan {
  if (!act) return AS_DRAWN;
  const need = board && act in ON_BOARD ? ON_BOARD[act] : ACT_HANDS[act];
  if (!need) return AS_DRAWN;
  if (need === "left" || need === "right") {
    const mine = grips[need];
    if (!mine) return AS_DRAWN;
    const free = other(need);
    if (!grips[free]) return { mirror: true, only: null, letGo: null };
    if (mine === "loose") return { mirror: false, only: null, letGo: need };
    if (grips[free] === "loose") return { mirror: true, only: null, letGo: free };
    // nothing to let go of: no job holds both hands that tightly (hands.test.ts)
    return AS_DRAWN;
  }
  const free = (["left", "right"] as const).filter((side) => !grips[side]);
  if (free.length === 2) return AS_DRAWN;
  // the card and its tool are drawn on the left; one-handed on the right they are drawn mirrored
  if (free.length === 1) return { mirror: need === "both" && free[0] === "right", only: free[0]!, letGo: null };
  const loose = (["left", "right"] as const).find((side) => grips[side] === "loose");
  if (!loose) return AS_DRAWN;
  return { mirror: need === "both" && loose === "right", only: loose, letGo: loose };
}

/**
 * A called act plays over whatever the face turns to while it lasts (D-82) — unless the turn would draw
 * its hand on the other side or take one of its hands away: then the arm would jump across the face in
 * one frame, or a card in the hand would land on the clipboard. Putting down the pencil for it is fine
 * (the hand stays where it is). `holding`: the employee carries the stack of orders — in the right
 * hand outside a job, put away in one; a wave mirrored for it would jump back when a job takes over.
 * Used by useMascotActs.
 */
export function keepsHands(act: MascotAct, from: MascotState, to: MascotState, holding = false): boolean {
  const board = from === "checking";
  if (board !== (to === "checking") && act in ON_BOARD) return false;
  const was = planHands(act, gripsOf(from, holding), board);
  const now = planHands(act, gripsOf(to, holding), to === "checking");
  return was.mirror === now.mirror && was.only === now.only;
}
