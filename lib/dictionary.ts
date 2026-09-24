import { resolveMatchingConfig, type MatchingConfig } from "@/lib/ai/config";
import { matchName, trigramSimilarity, type RosterUser } from "@/lib/matchName";
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

/** Spaces, hyphens and case do not make a different word: «Каз Азот» is «КазАзот». */
function compactKey(entry: string): string {
  return entryKey(entry).replace(/[\s-]/g, "");
}

/** Close enough by trigrams to be a misspelling of the same name — not a word of its own. */
const SIMILAR_FROM = 0.7;

/** Letters to change, add or drop to turn one string into the other. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Two spellings of one name: the same letters split differently («Каз Азот» / «КазАзот»),
 * a letter or two off («Касхром» / «Казхром» — one letter in seven is only 0.57 by trigrams,
 * so the edit distance speaks for short names), or close by trigrams. Keys shorter than five
 * letters are left alone — three letters apart are different abbreviations, not typos.
 */
export function nearSpelling(a: string, b: string): number {
  const x = a.replace(/[\s-]/g, "");
  const y = b.replace(/[\s-]/g, "");
  if (x === y) return 1;
  if (x.length < 5 || y.length < 5) return 0;
  const allowed = Math.min(x.length, y.length) >= 9 ? 2 : 1;
  if (editDistance(x, y) <= allowed) return 0.9;
  const score = trigramSimilarity(x, y);
  return score >= SIMILAR_FROM ? score : 0;
}

/** The word of the list this entry is most likely a variant of — see `nearSpelling`. */
export function similarWord(entry: string, words: readonly string[]): string | null {
  const key = entryKey(entry);
  const compact = compactKey(entry);
  if (compact.length < 3) return null;
  let best: { word: string; score: number } | null = null;
  for (const word of words) {
    if (entryKey(word) === key) continue;
    const score = nearSpelling(compact, compactKey(word));
    if (score > 0 && (!best || score > best.score)) best = { word, score };
  }
  return best?.word ?? null;
}

/** What one typed or pasted entry is to the list — the preview of a pasted column shows it per line. */
export type WordVerdict = "new" | "existing" | "similar" | "name" | "too_long" | "overflow";
export type WordLine = { entry: string; verdict: WordVerdict; /** the similar word, or the person */ to?: string };

export function classifyWords(current: readonly string[], text: string, people: readonly RosterPerson[]): WordLine[] {
  const have = new Set(current.map(entryKey));
  const lines: WordLine[] = [];
  let fresh = 0;
  for (const entry of splitEntries(text)) {
    const owner = ownersOf(entry, people)[0] ?? people.find((p) => entryKey(p.full_name) === entryKey(entry));
    const like = similarWord(entry, current);
    if (have.has(entryKey(entry))) lines.push({ entry, verdict: "existing" });
    else if (owner) lines.push({ entry, verdict: "name", to: owner.full_name });
    else if (entry.length > ENTRY_MAX_LENGTH) lines.push({ entry, verdict: "too_long" });
    else if (like) lines.push({ entry, verdict: "similar", to: like });
    else if (current.length + fresh >= VOCABULARY_MAX) lines.push({ entry, verdict: "overflow" });
    else {
      fresh += 1;
      lines.push({ entry, verdict: "new" });
    }
  }
  return lines;
}

/** What the vocabulary field will do with the text typed into it. */
export type WordsPlan = {
  add: string[];
  /** Already in the list. */
  existing: string[];
  /** Looks like a word already there — added only when asked for explicitly. */
  similar: { entry: string; to: string }[];
  /** A person's name: it is in the STT prompt already, through the roster. */
  names: { entry: string; person: string }[];
  tooLong: string[];
  /** Beyond `VOCABULARY_MAX`. */
  overflow: string[];
};

export function planWords(current: readonly string[], text: string, people: readonly RosterPerson[]): WordsPlan {
  const plan: WordsPlan = { add: [], existing: [], similar: [], names: [], tooLong: [], overflow: [] };
  for (const line of classifyWords(current, text, people)) {
    if (line.verdict === "new") plan.add.push(line.entry);
    else if (line.verdict === "existing") plan.existing.push(line.entry);
    else if (line.verdict === "similar") plan.similar.push({ entry: line.entry, to: line.to ?? "" });
    else if (line.verdict === "name") plan.names.push({ entry: line.entry, person: line.to ?? "" });
    else if (line.verdict === "too_long") plan.tooLong.push(line.entry);
    else plan.overflow.push(line.entry);
  }
  return plan;
}

/* -------------------------------------------------------------------------- */
/* Word kinds and the meta of a word                                           */
/* -------------------------------------------------------------------------- */

/**
 * What a word names — the company's own list (`settings.word_kinds`, D-111 §19): added,
 * renamed, reordered and removed on the screen; for order in the list only, the STT prompt
 * does not change. A word keeps the id, so a renamed type keeps its words.
 */
export type WordKindDef = { id: string; label: string };
/** The id of a type in `settings.word_kinds`. */
export type WordKind = string;

/** What a company starts with; the ids are the ones words were stamped with before types were editable. */
export const DEFAULT_WORD_KINDS: WordKindDef[] = [
  { id: "counterparty", label: "Контрагент" },
  { id: "site", label: "Объект" },
  { id: "product", label: "Товар" },
  { id: "term", label: "Термин" },
];
export const WORD_KINDS_MAX = 12;
export const KIND_LABEL_MAX = 24;
export const NO_KIND_LABEL = "Без типа";

/** Kept beside the list itself (`settings.vocabulary_meta`, keyed by `entryKey`). */
export type WordMeta = { kind: WordKind | null; added_at: string | null; added_by: string | null };

/** One change to the list of types. Each is replay-safe: a new type brings its own id. */
export type KindEdit =
  | { op: "add"; id: string; label: string }
  | { op: "rename"; id: string; label: string }
  /** The type's words go to `move_to`, or become «Без типа». */
  | { op: "remove"; id: string; move_to: string | null }
  | { op: "move"; id: string; index: number };

/**
 * A change to the types applied to the list and to the words that carry them — the server
 * and the optimistic screen run the same function. Two types with one name would make two
 * groups nobody can tell apart, so a name is refused when another type has it.
 */
export function applyKindEdit(
  kinds: readonly WordKindDef[],
  meta: Readonly<Record<string, WordMeta>>,
  edit: KindEdit,
): { kinds: WordKindDef[]; meta: Record<string, WordMeta>; conflict: string | null } {
  const list = [...kinds];
  const next: Record<string, WordMeta> = { ...meta };
  const at = list.findIndex((k) => k.id === edit.id);
  const label = "label" in edit ? edit.label.replace(/\s+/g, " ").trim() : "";
  const taken = (except: string) => list.some((k) => k.id !== except && entryKey(k.label) === entryKey(label));
  const nope = (conflict: string) => ({ kinds: [...kinds], meta: { ...meta }, conflict });

  if (edit.op === "add") {
    if (at !== -1) return { kinds: list, meta: next, conflict: null };
    if (!entryKey(label) || label.length > KIND_LABEL_MAX) return nope("Так тип не назвать");
    if (taken(edit.id)) return nope(`Тип «${label}» уже есть`);
    if (list.length >= WORD_KINDS_MAX) return nope(`Типов уже ${WORD_KINDS_MAX}`);
    list.push({ id: edit.id, label });
  } else if (edit.op === "rename") {
    if (at === -1) return { kinds: list, meta: next, conflict: null };
    if (!entryKey(label) || label.length > KIND_LABEL_MAX) return nope("Так тип не назвать");
    if (taken(edit.id)) return nope(`Тип «${label}» уже есть`);
    list[at] = { ...list[at], label };
  } else if (edit.op === "remove") {
    if (at === -1) return { kinds: list, meta: next, conflict: null };
    list.splice(at, 1);
    const to = edit.move_to && edit.move_to !== edit.id && list.some((k) => k.id === edit.move_to) ? edit.move_to : null;
    for (const [key, m] of Object.entries(next)) if (m.kind === edit.id) next[key] = { ...m, kind: to };
  } else {
    if (at === -1) return { kinds: list, meta: next, conflict: null };
    const [moved] = list.splice(at, 1);
    list.splice(Math.max(0, Math.min(edit.index, list.length)), 0, moved);
  }
  return { kinds: list, meta: next, conflict: null };
}

/** A type's label by id; an id no longer among the types reads as «Без типа». */
export function kindLabel(kinds: readonly WordKindDef[], id: string | null | undefined): string {
  return kinds.find((k) => k.id === id)?.label ?? NO_KIND_LABEL;
}

export type VocabularyEdit = {
  add?: string[];
  remove?: string[];
  /** The kind the added words get. */
  kind?: WordKind | null;
  set_kind?: { word: string; kind: WordKind | null };
  /** A spelling fixed: the word keeps its place, kind and history. */
  rename?: { from: string; to: string };
};

/**
 * One edit applied to the list and its meta — the server and the optimistic screen run
 * the same function. Set semantics hold for every part, so a replay from the outbox is
 * harmless: a rename whose `from` is gone and `to` is there has already happened.
 */
export function applyVocabularyEdit(
  vocabulary: readonly string[],
  meta: Readonly<Record<string, WordMeta>>,
  edit: VocabularyEdit,
  stamp: { at: string; by: string | null },
  /** The company's types: a kind that is not among them is written as «Без типа». */
  kinds?: readonly WordKindDef[],
): { vocabulary: string[]; meta: Record<string, WordMeta>; overflow: string[]; conflict: string | null } {
  const known = (kind: WordKind | null | undefined): WordKind | null =>
    kind && (!kinds || kinds.some((k) => k.id === kind)) ? kind : null;
  let list = [...vocabulary];
  const next: Record<string, WordMeta> = { ...meta };
  let conflict: string | null = null;

  if (edit.rename) {
    const to = edit.rename.to.replace(/\s+/g, " ").trim();
    const fromKey = entryKey(edit.rename.from);
    const toKey = entryKey(to);
    const at = list.findIndex((word) => entryKey(word) === fromKey);
    if (!toKey || to.length > ENTRY_MAX_LENGTH) conflict = "Так слово не записать";
    else if (at !== -1 && toKey !== fromKey && list.some((word) => entryKey(word) === toKey)) conflict = `«${to}» уже есть`;
    else if (at !== -1) {
      list[at] = to;
      if (toKey !== fromKey) {
        next[toKey] = next[fromKey] ?? { kind: null, added_at: null, added_by: null };
        delete next[fromKey];
      }
    }
  }

  const before = new Set(list.map(entryKey));
  const merged = mergeEntries(list, edit.add ?? [], edit.remove ?? [], VOCABULARY_MAX);
  list = merged.list;
  for (const word of edit.remove ?? []) delete next[entryKey(word)];
  for (const word of list) {
    const key = entryKey(word);
    if (!before.has(key) && !next[key]) next[key] = { kind: known(edit.kind), added_at: stamp.at, added_by: stamp.by };
  }

  if (edit.set_kind) {
    const key = entryKey(edit.set_kind.word);
    if (list.some((word) => entryKey(word) === key)) {
      next[key] = { ...(next[key] ?? { added_at: null, added_by: null }), kind: known(edit.set_kind.kind) };
    }
  }

  // meta never outlives its word
  const kept = new Set(list.map(entryKey));
  for (const key of Object.keys(next)) if (!kept.has(key)) delete next[key];
  return { vocabulary: list, meta: next, overflow: merged.overflow, conflict };
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
