/**
 * Which people the STT prompt should name (D-55). Measured 2026-09-15 on the owner's
 * live recordings: the sentence prompt holds up to ~50 people (~500 tokens) with no
 * echo and names at the end still honoured; at 100 people the noisiest recording came
 * back as an invented order for a random roster name twice in three runs. So the prompt
 * carries at most HINT_MAX_PEOPLE, chosen by how often the director actually addresses
 * them — the rest are still matched by the parser, just not spelled for the STT.
 */
export const HINT_MAX_PEOPLE = 60;

export interface HintCandidate {
  id: string;
}

/**
 * Stable order: most-addressed first, ties by id (the prompt is cached per its text,
 * so the order must not shuffle between requests). `counts` is tasks per assignee.
 */
export function pickHintRoster<T extends HintCandidate>(
  roster: T[],
  counts: ReadonlyMap<string, number>,
  max: number = HINT_MAX_PEOPLE,
): T[] {
  if (roster.length <= max) return roster;
  return [...roster]
    .sort((a, b) => {
      const diff = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
      if (diff !== 0) return diff;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, max);
}

/** tasks → assignee counts; the caller decides the window (recent tasks only). */
export function countByAssignee(rows: { assignee_id: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.assignee_id) continue;
    counts.set(row.assignee_id, (counts.get(row.assignee_id) ?? 0) + 1);
  }
  return counts;
}
