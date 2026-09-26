import type { Note } from "@/lib/notes/queries";

import { positionBetween } from "./list";
import type { Wait } from "./offline";
import { branchesOf, nextPlaceIn, type Branch } from "./tree";

/**
 * The phone's arithmetic of branches (D-121) on top of `tree.ts`: the numbers the wall gives
 * the points, what a closed card shows of a branch, where «Вынести в пункты» and «Сделать
 * подпунктом» put a line, how the bin files a branch, and the order the replay sends a
 * sub-point in. Pure — tests in `branch.test.ts`.
 */

type Placed = Pick<Note, "id" | "parent_id" | "position" | "created_at">;

/**
 * The numbers of the points as the wall draws them (D-121): 1…N over the points with words,
 * in the order of the board. A point still without words (being heard, or not heard) has no
 * number yet — the wall does not show it, and «пункт 3» must mean the same line on both.
 */
export function numbersOf<T extends Pick<Note, "id" | "parent_id" | "text">>(branches: readonly Branch<T>[]): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const { point } of branches) if (point.text.trim()) numbers.set(point.id, numbers.size + 1);
  return numbers;
}

/** A closed card shows this many sub-points; the rest is «ещё N». */
export const GLIMPSE = 3;

/**
 * What a closed card shows of a branch: the first sub-points and how many are left. «ещё 1»
 * takes the line the last sub-point would — so one over the limit is simply shown.
 */
export function glimpse<T>(children: readonly T[], max: number = GLIMPSE): { shown: T[]; more: number } {
  if (children.length <= max + 1) return { shown: [...children], more: 0 };
  return { shown: children.slice(0, max), more: children.length - max };
}

type Movable = Placed;

/**
 * «Вынести в пункты»: the sub-point steps out right after its own point — between it and the
 * next point — so the line stays where the eye left it. Null — it is not a sub-point here.
 */
export function promotedPlace(rows: readonly Movable[], subId: string): { parent_id: null; position: number } | null {
  const sub = rows.find((row) => row.id === subId);
  if (!sub || sub.parent_id === null) return null;
  const top = branchesOf(rows).map((branch) => branch.point);
  const at = top.findIndex((point) => point.id === sub.parent_id);
  if (at < 0) return null;
  const next = top[at + 1];
  return { parent_id: null, position: positionBetween(top[at].position ?? 0, next ? (next.position ?? 0) : null) };
}

/**
 * «Сделать подпунктом»: the point goes under the point right above it, as its last sub-point.
 * The server's rule (one level, a live point of the board) is also the UI's: the first point,
 * a point with sub-points of its own, and a point above that is not a point on the server
 * (`canHold` — e.g. still only on the phone) get null, and the button is not offered.
 */
export function demotedPlace(
  rows: readonly Movable[],
  pointId: string,
  canHold: (id: string) => boolean = () => true,
): { parent_id: string; position: number } | null {
  const branches = branchesOf(rows);
  const at = branches.findIndex((branch) => branch.point.id === pointId);
  if (at <= 0 || branches[at].children.length > 0) return null;
  const above = branches[at - 1].point;
  // a sub-point drawn as a point (its own point is gone) cannot hold a branch
  if (above.parent_id !== null || !canHold(above.id)) return null;
  return { parent_id: above.id, position: nextPlaceIn(rows, above.id) };
}

const instant = (iso: string | null) => (iso ? Date.parse(iso) : Number.NaN);

/**
 * The bin, branch by branch (D-121): a sub-point that went to the bin with its point (the
 * same `deleted_at` — the server stamps the branch with the point's time) rides on the
 * point's card; one deleted on its own is a card of its own. The order of the bin is kept.
 */
export function binCards<T extends Pick<Note, "id" | "parent_id" | "deleted_at">>(trash: readonly T[]): { card: T; riders: T[] }[] {
  const byId = new Map(trash.map((note) => [note.id, note]));
  const rides = (note: T) => {
    if (note.parent_id === null) return false;
    const point = byId.get(note.parent_id);
    return point !== undefined && instant(point.deleted_at) === instant(note.deleted_at);
  };
  const riders = new Map<string, T[]>();
  for (const note of trash) {
    if (!rides(note)) continue;
    const list = riders.get(note.parent_id as string) ?? [];
    list.push(note);
    riders.set(note.parent_id as string, list);
  }
  return trash.filter((note) => !rides(note)).map((card) => ({ card, riders: riders.get(card.id) ?? [] }));
}

/**
 * The replay's order (D-121): a sub-point never reaches the server before its point, whatever
 * the clocks said — a point said at 10:00:00.500 and its sub-point typed within the same
 * millisecond on another tab still go point first. Otherwise the order is kept.
 */
export function parentsFirst<T extends { id: string; parentId?: string | null }>(entries: readonly T[]): T[] {
  const ids = new Set(entries.map((entry) => entry.id));
  const out: T[] = [];
  const placed = new Set<string>();
  const waiting = new Map<string, T[]>();
  const place = (entry: T) => {
    out.push(entry);
    placed.add(entry.id);
    const kids = waiting.get(entry.id);
    if (!kids) return;
    waiting.delete(entry.id);
    for (const kid of kids) place(kid);
  };
  for (const entry of entries) {
    const parent = entry.parentId ?? null;
    if (parent !== null && ids.has(parent) && !placed.has(parent)) {
      const list = waiting.get(parent) ?? [];
      list.push(entry);
      waiting.set(parent, list);
    } else place(entry);
  }
  // a parent that never came (a loop cannot happen on the server; here it must not lose rows)
  for (const kids of waiting.values()) for (const kid of kids) if (!placed.has(kid.id)) out.push(kid);
  return out;
}

/** How a line of the board is doing on its way to words (принцип 5: the voice comes first). */
export type LineState = "words" | "saving" | "phone" | "point" | "hearing" | "deaf";

/**
 * The state of a line: its words — or where its voice is: being kept right now, waiting on
 * the phone for the network, waiting on the phone for its own point to land first (D-121),
 * being heard, or not heard (the recording is kept, «Распознать»).
 */
export function lineState(
  row: Pick<Note, "text" | "audio_path">,
  look: { phone: boolean; wait: Wait | null; hearing: boolean },
): LineState {
  if (row.text.trim()) return "words";
  if (look.phone) return look.wait === "point" ? "point" : look.wait === "network" ? "phone" : "saving";
  if (look.hearing) return "hearing";
  return row.audio_path ? "deaf" : "words";
}
