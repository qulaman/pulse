import { resolveMatchingConfig, type MatchingConfig } from "@/lib/ai/config";
import { matchName, type RosterUser } from "@/lib/matchName";
import { suggestAliases } from "@/lib/people/aliases";
import { firstNameOf, normalize } from "@/lib/text/normalize";

/**
 * The company's words (D-111): the names people are called by (`profiles.aliases`) and
 * the counterparties and sites the recogniser has to spell (`settings.vocabulary`). Pure
 * functions — the page, the vocabulary route and the tests share them.
 */

/** Mirrors `SettingsPatchSchema.vocabulary`. */
export const VOCABULARY_MAX = 200;
/**
 * Past this the list starts to cost more than it gives: every word rides in the STT
 * prompt, and a longer prompt is echoed and hallucinated more often (D-53, D-55).
 */
export const VOCABULARY_SOFT_MAX = 50;
/** Mirrors `POST /api/people`. */
export const ALIAS_MAX = 20;
export const ENTRY_MAX_LENGTH = 60;

/** Case, «ё» and punctuation never make two entries different: «Ерлан Б.» = «ерлан б». */
export function entryKey(entry: string): string {
  return normalize(entry);
}

/**
 * A typed or pasted list: commas, semicolons, tabs and line breaks separate entries, so a
 * column copied out of a spreadsheet lands as one entry per cell. Repeats are dropped.
 */
export function splitEntries(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[,;\t\r\n]/)) {
    const entry = raw.replace(/\s+/g, " ").trim();
    const key = entryKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/**
 * `current` without `remove`, then with every `add` it does not hold yet, up to `max`.
 * Set semantics make a replayed call harmless: adding twice or removing a gone entry
 * changes nothing.
 */
export function mergeEntries(
  current: readonly string[],
  add: readonly string[],
  remove: readonly string[],
  max: number,
): { list: string[]; overflow: string[] } {
  const gone = new Set(remove.map(entryKey));
  const list = current.filter((entry) => !gone.has(entryKey(entry)));
  const have = new Set(list.map(entryKey));
  const overflow: string[] = [];
  for (const raw of add) {
    const entry = raw.replace(/\s+/g, " ").trim();
    const key = entryKey(entry);
    if (!key || have.has(key)) continue;
    if (list.length >= max) {
      overflow.push(entry);
      continue;
    }
    have.add(key);
    list.push(entry);
  }
  return { list, overflow };
}

export type RosterPerson = { id: string; full_name: string; aliases: string[] };

/** The spoken forms a person answers to: the first name and every alias. */
function spokenKeys(person: RosterPerson): Set<string> {
  return new Set([firstNameOf(person.full_name), ...person.aliases].map(entryKey).filter(Boolean));
}

/** Who else answers to this spoken form — «Саша» with two Alexanders. */
export function ownersOf(entry: string, people: readonly RosterPerson[], except?: string): RosterPerson[] {
  const key = entryKey(entry);
  if (!key) return [];
  return people.filter((p) => p.id !== except && spokenKeys(p).has(key));
}

/** What the vocabulary field will do with the text typed into it. */
export type WordsPlan = {
  add: string[];
  /** Already in the list. */
  existing: string[];
  /** A person's name: it is in the STT prompt already, through the roster. */
  names: { entry: string; person: string }[];
  tooLong: string[];
  /** Beyond `VOCABULARY_MAX`. */
  overflow: string[];
};

export function planWords(current: readonly string[], text: string, people: readonly RosterPerson[]): WordsPlan {
  const have = new Set(current.map(entryKey));
  const plan: WordsPlan = { add: [], existing: [], names: [], tooLong: [], overflow: [] };
  for (const entry of splitEntries(text)) {
    const owner = ownersOf(entry, people)[0] ?? people.find((p) => entryKey(p.full_name) === entryKey(entry));
    if (have.has(entryKey(entry))) plan.existing.push(entry);
    else if (owner) plan.names.push({ entry, person: owner.full_name });
    else if (entry.length > ENTRY_MAX_LENGTH) plan.tooLong.push(entry);
    else if (current.length + plan.add.length >= VOCABULARY_MAX) plan.overflow.push(entry);
    else plan.add.push(entry);
  }
  return plan;
}

/** What the alias field of one person will do with the text typed into it. */
export type AliasPlan = {
  add: string[];
  existing: string[];
  /** The full name itself: the roster carries it already. */
  fullName: boolean;
  /** Forms somebody else answers to as well: said alone, the AI will ask «who?». */
  shared: { entry: string; people: string[] }[];
  tooShort: string[];
  tooLong: string[];
  overflow: string[];
};

export function planAliases(person: RosterPerson, text: string, people: readonly RosterPerson[]): AliasPlan {
  const have = new Set(person.aliases.map(entryKey));
  const full = entryKey(person.full_name);
  const plan: AliasPlan = { add: [], existing: [], fullName: false, shared: [], tooShort: [], tooLong: [], overflow: [] };
  for (const entry of splitEntries(text)) {
    const key = entryKey(entry);
    if (key === full) plan.fullName = true;
    else if (have.has(key)) plan.existing.push(entry);
    else if (key.length < 2) plan.tooShort.push(entry);
    else if (entry.length > ENTRY_MAX_LENGTH) plan.tooLong.push(entry);
    else if (person.aliases.length + plan.add.length >= ALIAS_MAX) plan.overflow.push(entry);
    else {
      plan.add.push(entry);
      const others = ownersOf(entry, people, person.id);
      if (others.length) plan.shared.push({ entry, people: others.map((p) => p.full_name) });
    }
  }
  return plan;
}

/** What the names page says about one person. */
export type NameReport = {
  /** Forms the app would give them on its own (D-54) that they still lack. */
  suggestions: string[];
  /** Their own forms somebody else answers to as well. */
  shared: { alias: string; people: string[] }[];
};

export function nameReport(person: RosterPerson, people: readonly RosterPerson[]): NameReport {
  const others = people.filter((p) => p.id !== person.id);
  const have = new Set(person.aliases.map(entryKey));
  const suggestions = suggestAliases(person.full_name, others).mine.filter((alias) => !have.has(entryKey(alias)));
  const shared = person.aliases.flatMap((alias) => {
    const owners = ownersOf(alias, others);
    return owners.length ? [{ alias, people: owners.map((p) => p.full_name) }] : [];
  });
  return { suggestions, shared };
}

type Verdict =
  | { kind: "sure"; person: string }
  | { kind: "check"; person: string }
  | { kind: "ask"; people: string[] }
  | { kind: "none" };

/**
 * How the name matcher would take a spoken form on its own, before the model has a say.
 * `teach` — giving this very form to one person would make it certain; false where no
 * alias helps: a bare first name two people share is asked about whatever they are
 * called (matchName step 0), and a form two people already answer to stays theirs.
 */
export type NameCheck = { kind: "sure"; person: string } | (Exclude<Verdict, { kind: "sure" }> & { teach: boolean });

function judge(spoken: string, people: readonly RosterPerson[], cfg: MatchingConfig): Verdict {
  const roster: RosterUser[] = people.map((p) => ({ ...p, is_active: true }));
  const match = matchName(
    { assignee_name: null, assignee_id: null, assignee_queries: [spoken], assignee_confidence: 1 },
    roster,
    cfg,
  );
  const [first] = match.candidates;
  if (match.status === "matched" && first) return match.flag === "ok" ? { kind: "sure", person: first.full_name } : { kind: "check", person: first.full_name };
  // one weak candidate is a guess to confirm, not a choice between people
  if (match.status === "ambiguous" && match.candidates.length === 1 && first) return { kind: "check", person: first.full_name };
  if (match.status === "ambiguous") return { kind: "ask", people: match.candidates.map((c) => c.full_name) };
  return { kind: "none" };
}

export function checkName(
  spoken: string,
  people: readonly RosterPerson[],
  matching?: Partial<MatchingConfig>,
): NameCheck | null {
  const form = spoken.replace(/\s+/g, " ").trim();
  if (!entryKey(form)) return null;
  const cfg = resolveMatchingConfig(matching);
  const verdict = judge(form, people, cfg);
  if (verdict.kind === "sure") return verdict;

  const likely = verdict.kind === "check" ? verdict.person : verdict.kind === "ask" ? verdict.people[0] : undefined;
  const probe = people.find((p) => p.full_name === likely) ?? people[0];
  const taught = probe
    ? judge(form, people.map((p) => (p.id === probe.id ? { ...p, aliases: [...p.aliases, form] } : p)), cfg)
    : null;
  return { ...verdict, teach: taught?.kind === "sure" };
}

/** Alphabetical, the way a person scans a list of names. */
export function byRussian(a: string, b: string): number {
  return a.localeCompare(b, "ru", { sensitivity: "base" });
}
