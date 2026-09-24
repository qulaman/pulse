import { resolveMatchingConfig, type MatchingConfig } from "@/lib/ai/config";
import { ALIAS_MAX, ENTRY_MAX_LENGTH, entryKey, ownersOf, type RosterPerson } from "@/lib/dictionary";
import { matchName, type AssigneeMatch } from "@/lib/matchName";
import { firstNameOf, stems } from "@/lib/text/normalize";

/**
 * The dictionary learns from the director's own corrections (D-111, second wave): a name
 * the AI could not place, and the person the director placed it on, is a form worth
 * remembering. Pure — the board's «Запомнить?» and the «Из ваших записей» list share it.
 */

/** What was heard for one entity: the verbatim mentions and how the matcher took them. */
export type Heard = {
  queries: readonly string[];
  match: Pick<AssigneeMatch, "status" | "flag"> | null | undefined;
};

/**
 * The form to remember for «heard → person» — what was said, or the person's first name
 * when what was said is just a case of it — or null when there is nothing to learn:
 *  - the matcher was sure and the director chose somebody else — a change of mind, not
 *    a mishearing;
 *  - somebody else answers to the form (their first name or alias);
 *  - the person answers to it already, or it is their full name;
 *  - giving it to them would still not make the matcher sure — a bare first name two
 *    people share is asked about whatever the aliases say (matchName step 0).
 */
export function lessonOf(
  heard: Heard,
  personId: string,
  people: readonly RosterPerson[],
  matching?: Partial<MatchingConfig>,
): string | null {
  const spoken = (heard.queries[0] ?? "").replace(/\s+/g, " ").trim();
  if (heard.match?.status === "matched" && heard.match.flag === "ok") return null;

  const person = people.find((p) => p.id === personId);
  if (!person || person.aliases.length >= ALIAS_MAX) return null;
  // «Марату» is a case of the person's own first name: remember «Марат», not the case
  const first = firstNameOf(person.full_name);
  const form = spoken && stems(spoken).join(" ") === stems(first).join(" ") ? first : spoken;
  const key = entryKey(form);
  if (key.length < 2 || form.length > ENTRY_MAX_LENGTH) return null;
  if (key === entryKey(person.full_name) || person.aliases.some((alias) => entryKey(alias) === key)) return null;
  if (ownersOf(form, people, personId).length) return null;

  // taught the form, the matcher must be sure of this very person on what was said
  const taught = people.map((p) => ({ ...p, aliases: p.id === personId ? [...p.aliases, form] : p.aliases, is_active: true }));
  const match = matchName(
    { assignee_name: null, assignee_id: null, assignee_queries: [spoken], assignee_confidence: 1 },
    taught,
    resolveMatchingConfig(matching),
  );
  return match.status === "matched" && match.flag === "ok" && match.user_id === personId ? form : null;
}

/** Entity kinds that name one person (lib/ai/postprocess.ts). */
const ASSIGNABLE = new Set(["task", "points", "recurrence", "delegation"]);

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/**
 * Where the director put somebody else than the parse did, in one confirmed batch. A card
 * is found by what the director never edits — its kind, the phrase it came from and the
 * names heard in it — so a removed card does not shift the others (index is not identity
 * once cards go away), and two copies of one phrase («Ерлану и Марату») stay apart.
 */
export function correctionsIn(parsed: unknown, confirmed: unknown): { heard: Heard; personId: string }[] {
  if (!Array.isArray(parsed) || !Array.isArray(confirmed)) return [];
  const out: { heard: Heard; personId: string }[] = [];
  for (const after of confirmed) {
    if (!isRow(after) || !ASSIGNABLE.has(String(after.kind)) || typeof after.assignee_id !== "string") continue;
    const queries = strings(after.assignee_queries);
    if (!queries.length) continue;
    const before = parsed.find(
      (row): row is Row =>
        isRow(row) &&
        row.kind === after.kind &&
        row.source_span === after.source_span &&
        JSON.stringify(strings(row.assignee_queries)) === JSON.stringify(queries),
    );
    if (!before || before.assignee_id === after.assignee_id) continue;
    const match = isRow(before.assignee) ? (before.assignee as Heard["match"]) : null;
    out.push({ heard: { queries, match }, personId: after.assignee_id });
  }
  return out;
}

export type Misheard = {
  /** `${personId}:${entryKey(form)}` — what «×» hides for good. */
  key: string;
  form: string;
  personId: string;
  fullName: string;
  times: number;
  /** ISO of the latest time it was heard. */
  lastAt: string;
};

export function misheardKey(personId: string, form: string): string {
  return `${personId}:${entryKey(form)}`;
}

/**
 * «Из ваших записей»: the lessons of the confirmed batches, against today's roster — a
 * form remembered since is not a lesson any more — without the ones hidden with «×»,
 * most frequent first.
 */
export function collectMisheard(
  rows: readonly { parsed_entities: unknown; confirmed_entities: unknown; created_at: string }[],
  people: readonly RosterPerson[],
  matching: Partial<MatchingConfig> | undefined,
  dismissed: readonly string[],
  limit = 20,
): Misheard[] {
  const hidden = new Set(dismissed);
  const found = new Map<string, Misheard>();
  for (const row of rows) {
    for (const { heard, personId } of correctionsIn(row.parsed_entities, row.confirmed_entities)) {
      const form = lessonOf(heard, personId, people, matching);
      if (!form) continue;
      const key = misheardKey(personId, form);
      if (hidden.has(key)) continue;
      const seen = found.get(key);
      if (seen) {
        seen.times += 1;
        if (row.created_at > seen.lastAt) seen.lastAt = row.created_at;
      } else {
        const person = people.find((p) => p.id === personId);
        found.set(key, { key, form, personId, fullName: person?.full_name ?? "", times: 1, lastAt: row.created_at });
      }
    }
  }
  return [...found.values()]
    .sort((a, b) => b.times - a.times || (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0))
    .slice(0, limit);
}
