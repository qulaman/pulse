import type { Entity } from "./schema";

export type EditDiff = { was_edited: boolean; edit_fields: string[] };

/**
 * Fields postprocess() adds on top of the model's output. They describe how the
 * match was made, not what the director confirmed — a diff on them is noise.
 */
const IGNORED_FIELDS = new Set(["assignee", "blocked"]);

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Diff parsed↔confirmed for the "edit ratio" metric (D-35, docs/AI.md §10).
 * Entities are matched by position: the /confirm screen edits cards in place,
 * so index is identity. Result lands in ai_logs via confirm_voice_batch.
 */
export function editDiff(parsed: Entity[], confirmed: Entity[]): EditDiff {
  const edit_fields: string[] = [];
  const length = Math.max(parsed.length, confirmed.length);

  for (let i = 0; i < length; i += 1) {
    const before = parsed[i] as Record<string, unknown> | undefined;
    const after = confirmed[i] as Record<string, unknown> | undefined;

    if (before && !after) {
      edit_fields.push(`entity.${i}.removed`);
      continue;
    }
    if (!before && after) {
      edit_fields.push(`entity.${i}.added`);
      continue;
    }
    if (!before || !after) continue;

    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (IGNORED_FIELDS.has(key)) continue;
      if (!sameValue(before[key], after[key])) edit_fields.push(`entity.${i}.${key}`);
    }
  }

  return { was_edited: edit_fields.length > 0, edit_fields };
}
