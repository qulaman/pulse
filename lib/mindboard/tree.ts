import type { Note } from "@/lib/notes/queries";

/**
 * A board as a tree of one level (D-121): points in the order of the board, each with its
 * sub-points in their own order. The phone draws it, the remote steps through it, the wall
 * gets the same shape from `tv_board()`. Pure — tests in `tree.test.ts`.
 */

export type Branch<T extends Pick<Note, "id" | "parent_id"> = Note> = { point: T; children: T[] };

type Placed = Pick<Note, "id" | "parent_id" | "position" | "created_at">;

const byPlace = (a: Placed, b: Placed) => (a.position ?? 0) - (b.position ?? 0) || a.created_at.localeCompare(b.created_at);

/**
 * Points and their sub-points, both in the order of the board. A sub-point whose point is
 * not among the rows (still on its way, or already in the bin) is drawn as a point: a line
 * the director said never disappears from the board he is looking at.
 */
export function branchesOf<T extends Placed>(rows: readonly T[]): Branch<T>[] {
  const ids = new Set(rows.map((row) => row.id));
  const top = rows.filter((row) => row.parent_id === null || !ids.has(row.parent_id)).sort(byPlace);
  const kids = new Map<string, T[]>();
  for (const row of rows) {
    if (row.parent_id === null || !ids.has(row.parent_id)) continue;
    const list = kids.get(row.parent_id) ?? [];
    list.push(row);
    kids.set(row.parent_id, list);
  }
  return top.map((point) => ({ point, children: (kids.get(point.id) ?? []).sort(byPlace) }));
}

/** The place after the last sibling: under a point — after its last sub-point; at the top — after the last point. */
export function nextPlaceIn(rows: readonly Pick<Note, "parent_id" | "position">[], parentId: string | null): number {
  let max = 0;
  for (const row of rows) if (row.parent_id === parentId && (row.position ?? 0) > max) max = row.position ?? 0;
  return Math.floor(max) + 1;
}

/**
 * The presenter's step (D-121): ◀ ▶ through the points of the board. No spotlight yet —
 * ▶ starts at the first point, ◀ at the last; at an edge the step stays put (null = no
 * move), so a double tap at the end does not wrap the meeting back to its beginning.
 */
export function stepPoint(order: readonly string[], current: string | null, direction: 1 | -1): string | null {
  if (order.length === 0) return null;
  const at = current === null ? -1 : order.indexOf(current);
  if (at < 0) return direction === 1 ? order[0] : order[order.length - 1];
  const next = at + direction;
  if (next < 0 || next >= order.length) return null;
  return order[next];
}

/** «3 из 7» — where the meeting is; null before the first step. */
export function stepLabel(order: readonly string[], current: string | null): string | null {
  if (current === null) return null;
  const at = order.indexOf(current);
  return at < 0 ? null : `${at + 1} из ${order.length}`;
}
