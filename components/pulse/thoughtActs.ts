import type { MascotAct } from "@/components/brand/Mascot";
import type { BoardEventKind } from "@/lib/pulse/board";

/**
 * What the director's face plays for each change on the board (tasks/020): the employee's steps
 * and the director's own decisions alike, since both land in the board the same way. A kind that
 * is not here keeps the plain «reads the data» of D-65 (`processing`): a new task has already been
 * thrown in `sending`, and «передана» is in practice a revoke plus a new row.
 */
export const THOUGHT_ACT: Partial<Record<BoardEventKind, MascotAct>> = {
  accepted: "tick",
  handed: "receive",
  declined: "hmm",
  question: "puzzle",
  message: "letter",
  done: "stamp",
  rework: "flick",
  revoked: "crumple",
  resent: "push",
  moved: "clock",
  answered: "reply",
};

/** The act for a thought, if its kind has one. */
export function thoughtAct(kind: BoardEventKind | undefined): MascotAct | null {
  return kind ? (THOUGHT_ACT[kind] ?? null) : null;
}
