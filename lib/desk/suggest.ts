/**
 * Whom the director is typing (D-154): the word under the caret of the order line, matched against
 * the company's names and aliases — «Ер» finds both Ерланы, «Марату» finds Марат, «Дине» finds
 * Дина. Picking one pins the person by id, so the parser never has to guess «кому из них».
 */

export type SuggestPerson = { id: string; full_name: string; position?: string | null; aliases?: string[] | null };

/** ё → е, lower case: the way people type a name. */
export function fold(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е");
}

/** The word right before the caret, when the caret ends a word: where it starts and what it is. */
export function wordAtCaret(text: string, caret: number): { start: number; word: string } | null {
  if (caret !== text.length && /[\p{L}\d]/u.test(text[caret] ?? "")) return null;
  const before = text.slice(0, caret);
  const match = /([\p{L}]+)$/u.exec(before);
  if (!match) return null;
  return { start: caret - match[1].length, word: match[1] };
}

/** One typed word against one name word: a beginning, or the same stem in another case. */
export function fits(typed: string, word: string): boolean {
  if (word.startsWith(typed)) return true;
  if (typed.startsWith(word)) return word.length >= 3;
  // «Дине» — «Дина», «Ерлану» — «Ерлан»: all but the last letter agree
  const stem = word.length - 1;
  return typed.length >= 4 && stem >= 3 && typed.slice(0, stem) === word.slice(0, stem);
}

/** Up to `limit` people whose first name, surname or alias fits the typed word; two letters at least. */
export function suggestPeople<T extends SuggestPerson>(people: readonly T[], typed: string, limit = 5): T[] {
  const needle = fold(typed.trim());
  if (needle.length < 2) return [];
  const scored: { person: T; score: number }[] = [];
  for (const person of people) {
    const names = fold(person.full_name).split(/[\s\-]+/).filter(Boolean);
    const aliases = (person.aliases ?? []).flatMap((alias) => fold(alias).split(/[\s\-]+/)).filter(Boolean);
    // the first name first, then the surname, then an alias
    const at = [names[0], ...names.slice(1), ...aliases].findIndex((word) => word && fits(needle, word));
    if (at >= 0) scored.push({ person, score: at === 0 ? 0 : at <= names.length - 1 ? 1 : 2 });
  }
  scored.sort((a, b) => a.score - b.score || a.person.full_name.localeCompare(b.person.full_name, "ru"));
  return scored.slice(0, limit).map((entry) => entry.person);
}
