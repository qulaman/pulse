import type { NoteFields } from "@/lib/notes/pending";
import type { Note } from "@/lib/notes/queries";

/**
 * The lines of a board on their way to the server (D-95, D-121), pure: why a line has not
 * landed yet, what of a refused edit still goes, and how the cache takes a refused edit
 * back. No React, no network — tests in `offline.test.ts`.
 */

/**
 * Why a line waits: for the network — or, with the network up, for its own point. A
 * sub-point said under a point that has not left the phone yet cannot land first (the
 * server refuses a parent it has not seen, `bad_parent`); the replay sends the point and the
 * sub-point right after it, so «нет связи» would be a lie.
 */
export type Wait = "network" | "point";

export function waitOf(
  row: Pick<Note, "id" | "parent_id">,
  look: {
    /** Something of this line is owed to the server and it has waited too long (or there is no network). */
    late: (id: string) => boolean;
    /** This line exists only on the phone so far (a create not yet on the server). */
    owed: (id: string) => boolean;
    online: boolean;
  },
): Wait | null {
  if (!look.late(row.id)) return null;
  if (look.online && look.owed(row.id) && row.parent_id !== null && look.owed(row.parent_id)) return "point";
  return "network";
}

/** The fields of an edit that change the shape of a branch (D-121): the parent and the place under it. */
const BRANCH_KEYS = ["parent_id", "position"] as const satisfies readonly (keyof NoteFields)[];

/** Does this edit move a line between branches — the kind of edit the server may refuse with `bad_parent`? */
export function movesBranch(fields: NoteFields): boolean {
  return "parent_id" in fields;
}

/**
 * The server refused the branch part of an owed edit (`bad_parent`: the point above was
 * deleted, became a sub-point, or got sub-points of its own while the phone was offline):
 * the rest of it — the text, a tick — is still the director's and still goes. The place
 * goes with the parent: a position meant among sub-points would throw a point to the top
 * of the board. Null — nothing is left to write.
 */
export function withoutBranch(fields: NoteFields): NoteFields | null {
  if (!movesBranch(fields)) return fields;
  const rest: NoteFields = { ...fields };
  for (const key of BRANCH_KEYS) delete rest[key];
  return Object.keys(rest).length > 0 ? rest : null;
}

/** The values a row had for the fields of an edit, taken before the edit was drawn. */
export function valuesBefore(row: Partial<Note> | undefined, fields: Partial<Note>): Partial<Note> {
  const was: Record<string, unknown> = {};
  if (row) for (const key of Object.keys(fields) as (keyof Note)[]) was[key] = row[key];
  return was as Partial<Note>;
}

/**
 * A refused edit taken back in the cache — only this row, only these fields, and only where
 * the cache still shows what this edit wrote: a newer edit of the same field, a line created
 * since, a deletion or a Realtime row that came meanwhile all stay (a snapshot of the whole
 * list taken at the tap would bring back a world that no longer exists).
 */
export function revertEdit<T extends Pick<Note, "id">>(rows: readonly T[], id: string, wrote: Partial<Note>, was: Partial<Note>): T[] {
  return rows.map((row) => {
    if (row.id !== id) return row;
    const next: Record<string, unknown> = { ...row };
    for (const key of Object.keys(wrote) as (keyof Note)[]) {
      if (!(key in was)) continue;
      if (next[key] === wrote[key]) next[key] = was[key];
    }
    return next as T;
  });
}
