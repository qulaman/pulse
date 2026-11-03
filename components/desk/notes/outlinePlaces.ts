import { afterPlace } from "@/lib/mindboard/branch";
import { positionBetween } from "@/lib/mindboard/list";
import { branchesOf, nextPlaceIn } from "@/lib/mindboard/tree";
import type { Note } from "@/lib/notes/queries";

/**
 * The desk's board as an outline (wave 3, D-121): points and their sub-points, one level, typed
 * line after line. A line being typed is a draft until it has words — only then is it a note on
 * the server, at the place the draft held. Pure arithmetic of places over the board's rows; the
 * rules of branches are the phone's (`lib/mindboard/branch.ts`).
 */

type Placed = Pick<Note, "id" | "parent_id" | "position" | "created_at">;

/**
 * A line still without words: a point (`parent` null) after the branch of point `after` — or at
 * the end of the board; or a sub-point of `parent` right after its sub-point `after` — or the
 * first one when `after` is null.
 */
export type Draft = { id: string; parent: string | null; after: string | null; text: string };

const byPlace = (a: Placed, b: Placed) => (a.position ?? 0) - (b.position ?? 0) || a.created_at.localeCompare(b.created_at);

/** The sub-points of a point, in order. */
export function childrenOf<T extends Placed>(rows: readonly T[], pointId: string): T[] {
  return rows.filter((row) => row.parent_id === pointId).sort(byPlace);
}

/** Where a draft lands when it gets words: its parent and its place among its siblings. */
export function draftPlace(rows: readonly Placed[], draft: Pick<Draft, "parent" | "after">): { parent_id: string | null; position: number } {
  if (draft.parent !== null) {
    const siblings = childrenOf(rows, draft.parent);
    if (draft.after === null) return { parent_id: draft.parent, position: positionBetween(null, siblings[0]?.position ?? null) };
    const at = siblings.findIndex((row) => row.id === draft.after);
    if (at < 0) return { parent_id: draft.parent, position: nextPlaceIn(rows, draft.parent) };
    return { parent_id: draft.parent, position: positionBetween(siblings[at].position ?? 0, siblings[at + 1]?.position ?? null) };
  }
  if (draft.after !== null) return { parent_id: null, position: afterPlace(rows, draft.after) };
  return { parent_id: null, position: nextPlaceIn(rows, null) };
}

/**
 * The draft Enter makes after a line (Workflowy's way, one level): after a point with sub-points —
 * its first sub-point, right under it; after a point without — the next point; after a sub-point
 * — the next sub-point of the same point.
 */
export function draftAfter(rows: readonly Placed[], row: Placed, id: string): Draft {
  const ids = new Set(rows.map((other) => other.id));
  const sub = row.parent_id !== null && ids.has(row.parent_id);
  if (sub) return { id, parent: row.parent_id, after: row.id, text: "" };
  if (childrenOf(rows, row.id).length > 0) return { id, parent: row.id, after: null, text: "" };
  return { id, parent: null, after: row.id, text: "" };
}

/**
 * Tab on a draft point: a sub-point of the point it stands under, at the end of that point's
 * sub-points. `canHold` — the point is on the server and is a point there. Null — nothing above.
 */
export function draftIndented(rows: readonly Placed[], draft: Draft, canHold: (id: string) => boolean): Draft | null {
  if (draft.parent !== null) return null;
  const top = branchesOf(rows).map((branch) => branch.point);
  const above = draft.after !== null ? top.find((point) => point.id === draft.after) : top[top.length - 1];
  if (!above || above.parent_id !== null || !canHold(above.id)) return null;
  const kids = childrenOf(rows, above.id);
  return { ...draft, parent: above.id, after: kids[kids.length - 1]?.id ?? null };
}

/** Shift+Tab on a draft sub-point: a point right after the branch it was in. */
export function draftOutdented(draft: Draft): Draft | null {
  if (draft.parent === null) return null;
  return { ...draft, parent: null, after: draft.parent };
}

/** The siblings a line moves among: the points of the board, or the sub-points of its point. */
export function siblingsOf<T extends Placed>(rows: readonly T[], row: T): T[] {
  const ids = new Set(rows.map((other) => other.id));
  if (row.parent_id !== null && ids.has(row.parent_id)) return childrenOf(rows, row.parent_id);
  return branchesOf(rows).map((branch) => branch.point);
}

/** Ctrl+Shift+↑/↓: the place one step up or down among its siblings; null — at the edge already. */
export function stepPlace(rows: readonly Placed[], row: Placed, direction: -1 | 1): number | null {
  const siblings = siblingsOf(rows, row);
  const at = siblings.findIndex((other) => other.id === row.id);
  if (at < 0) return null;
  if (direction === -1) {
    if (at === 0) return null;
    return positionBetween(siblings[at - 2]?.position ?? null, siblings[at - 1].position ?? 0);
  }
  if (at === siblings.length - 1) return null;
  return positionBetween(siblings[at + 1].position ?? 0, siblings[at + 2]?.position ?? null);
}

/** A drop among the siblings: `index` — where it goes in the list without the moved line. */
export function dropPlace(rows: readonly Placed[], row: Placed, index: number): number | null {
  const others = siblingsOf(rows, row).filter((other) => other.id !== row.id);
  const before = others[index - 1] ?? null;
  const after = others[index] ?? null;
  const was = siblingsOf(rows, row).findIndex((other) => other.id === row.id);
  if (was === index) return null;
  return positionBetween(before ? (before.position ?? 0) : null, after ? (after.position ?? 0) : null);
}

/** The line a caret goes to from `id`: the one above or below in the order on screen. */
export function neighbourLine(order: readonly string[], id: string, direction: -1 | 1): string | null {
  const at = order.indexOf(id);
  if (at < 0) return null;
  return order[at + direction] ?? null;
}
