import { normalize } from "@/lib/text/normalize";

/**
 * Spoken-name suggestions for the roster (D-54). The director says «Ерлан», not
 * «Ерлан Байжанов»; with two Erlans they say «Ерлан Б.». Nobody should have to invent
 * that by hand for every hire, so the form and POST /api/people derive it.
 */
export type RosterName = { full_name: string; aliases: string[] };

export interface AliasSuggestion {
  /** For the person being created/edited. */
  mine: string[];
  /** Namesakes who lack the initial alias that now tells them apart. */
  forOthers: { full_name: string; alias: string }[];
  /** Namesakes' full names, for the form hint. */
  namesakes: string[];
}

function words(fullName: string): string[] {
  return fullName.trim().split(/\s+/).filter(Boolean);
}

/** «Ерлан Байжанов» → «Ерлан Б.»; null without a surname. */
export function initialAlias(fullName: string): string | null {
  const [first, surname] = words(fullName);
  if (!first || !surname) return null;
  return `${first} ${surname[0].toUpperCase()}.`;
}

function hasAlias(aliases: string[], alias: string): boolean {
  const wanted = normalize(alias);
  return aliases.some((a) => normalize(a) === wanted);
}

/**
 * Short labels for a list of people: the first name, or «Имя Ф.» where two share it —
 * what a chip or a shortlist can afford where the full name cannot.
 */
export function shortNames<T extends { id: string; full_name: string }>(people: T[]): Map<string, string> {
  const byFirst = new Map<string, number>();
  for (const p of people) {
    const key = normalize(words(p.full_name)[0] ?? "");
    byFirst.set(key, (byFirst.get(key) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const p of people) {
    const [first] = words(p.full_name);
    const shared = (byFirst.get(normalize(first ?? "")) ?? 0) > 1;
    out.set(p.id, (shared ? initialAlias(p.full_name) : null) ?? first ?? p.full_name);
  }
  return out;
}

export function suggestAliases(fullName: string, others: RosterName[]): AliasSuggestion {
  const [first] = words(fullName);
  if (!first) return { mine: [], forOthers: [], namesakes: [] };

  const key = normalize(first);
  const namesakes = others.filter((o) => normalize(words(o.full_name)[0] ?? "") === key);

  const mine = [first];
  const withInitial = initialAlias(fullName);
  if (namesakes.length && withInitial) mine.push(withInitial);

  const forOthers = namesakes.flatMap((o) => {
    const alias = initialAlias(o.full_name);
    return alias && !hasAlias(o.aliases, alias) ? [{ full_name: o.full_name, alias }] : [];
  });

  return { mine, forOthers, namesakes: namesakes.map((o) => o.full_name) };
}
