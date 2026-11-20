/**
 * Finding a person by what was typed — one rule for every picker of the app, the phone's and the
 * desk's, and for the desk's palette: «ер б» finds «Ерлан Бекмуханов», «бух» the accountant,
 * «семен» finds «Семён», «Ерлану» finds Ерлан, a nickname finds its person. Pure.
 */

/** Lower case, «ё» as «е»: the way people type a name — «Семён» is found by «семен». */
export function foldRu(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е");
}

/** The folded words of a text: letters and digits, everything else splits. */
export function searchWords(text: string | null | undefined): string[] {
  return foldRu(text ?? "")
    .split(/[^\p{L}\d]+/u)
    .filter(Boolean);
}

/** One typed word against one word of a name: a beginning, or the same stem in another case. */
export function fits(typed: string, word: string): boolean {
  if (word.startsWith(typed)) return true;
  if (typed.startsWith(word)) return word.length >= 3;
  // «Дине» — «Дина», «Ерлану» — «Ерлан»: all but the last letter agree
  const stem = word.length - 1;
  return typed.length >= 4 && stem >= 3 && typed.slice(0, stem) === word.slice(0, stem);
}

/** Every typed word fits some word of the item: «смет ерл» finds Ерлан's «Проверить смету». */
export function allFit(typed: readonly string[], haystack: readonly string[]): boolean {
  return typed.length > 0 && typed.every((t) => haystack.some((w) => fits(t, w)));
}

export type SearchPerson = { full_name: string; position?: string | null; aliases?: string[] | null };

/** The words a person is found by: the name, the nicknames, the position. */
function personWords(person: SearchPerson): string[] {
  return [...searchWords(person.full_name), ...(person.aliases ?? []).flatMap((alias) => searchWords(alias)), ...searchWords(person.position)];
}

/** Whether a person fits the typed words — for a list that keeps its own order. An empty query fits everybody. */
export function personFits(person: SearchPerson, query: string): boolean {
  const typed = searchWords(query);
  return typed.length === 0 || allFit(typed, personWords(person));
}

/**
 * People by any part of the name, a nickname or the position — every typed word must fit a word
 * of them (D-108). A first-name match comes first, then the rest, each group by name. An empty
 * query is everybody, in the given order.
 */
export function searchPeople<T extends SearchPerson>(people: readonly T[], query: string, limit = Infinity): T[] {
  const typed = searchWords(query);
  if (typed.length === 0) return people.slice(0, limit);
  const scored: { person: T; score: number }[] = [];
  for (const person of people) {
    if (!allFit(typed, personWords(person))) continue;
    const names = searchWords(person.full_name);
    scored.push({ person, score: names[0] && fits(typed[0], names[0]) ? 0 : names.some((w) => fits(typed[0], w)) ? 1 : 2 });
  }
  scored.sort((a, b) => a.score - b.score || a.person.full_name.localeCompare(b.person.full_name, "ru"));
  return scored.slice(0, limit).map((entry) => entry.person);
}

/**
 * The team lists' filter (the phone's «Команда», the desk's «Люди»): every typed word somewhere
 * inside the texts — a piece of a word too, so «лан» finds Ерлан and «777» a phone number.
 */
export function textHas(texts: readonly (string | null | undefined)[], query: string): boolean {
  const typed = foldRu(query).split(/\s+/).filter(Boolean);
  if (typed.length === 0) return true;
  const hay = foldRu(texts.filter(Boolean).join(" "));
  return typed.every((word) => hay.includes(word));
}
