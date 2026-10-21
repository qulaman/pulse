import { create } from "zustand";

/**
 * A person's name on a screen (D-146): the first name — «Марат» — until the company has two
 * people of that name; then the surname's initial tells them apart — «Ерлан Б.», «Ерлан Д.» —
 * or the whole surname, when the initials meet too («Ерлан Байжанов», «Ерлан Бекмуханов»).
 *
 * Only for showing. What the director says and what the parser matches stays the bare first
 * name (`firstNameOf` in lib/text/normalize.ts, aliases in lib/people/aliases.ts).
 *
 * The company's names come from the roster (`NamesSync` under every signed-in layout); until
 * they have, and on the server, names are bare — a screen renders no other person's name
 * before its data, which is read in the browser, so the first frames match.
 */

type Index = ReadonlyMap<string, readonly string[]>;

const fold = (text: string) => text.toLowerCase().replace(/ё/g, "е");
const wordsOf = (fullName: string) => fullName.trim().split(/\s+/).filter(Boolean);

/** First name (folded) → the full names that carry it. */
export function indexNames(fullNames: readonly string[]): Index {
  const index = new Map<string, string[]>();
  for (const raw of fullNames) {
    const words = wordsOf(raw);
    if (!words[0]) continue;
    const full = words.join(" ");
    const key = fold(words[0]);
    const same = index.get(key) ?? [];
    if (!same.some((name) => fold(name) === fold(full))) same.push(full);
    index.set(key, same);
  }
  return index;
}

export function shortNameIn(fullName: string | null | undefined, index: Index): string {
  const words = wordsOf(fullName ?? "");
  const first = words[0];
  if (!first) return "";
  const surname = words[1];
  const others = (index.get(fold(first)) ?? []).filter((name) => fold(name) !== fold(words.join(" ")));
  if (!surname || others.length === 0) return first;
  const initial = fold(surname[0]!);
  const meets = others.some((name) => fold(wordsOf(name)[1]?.[0] ?? "") === initial);
  return meets ? `${first} ${surname}` : `${first} ${surname[0]!.toUpperCase()}.`;
}

type NamesState = { index: Index; key: string };

const useNamesStore = create<NamesState>(() => ({ index: new Map(), key: "" }));

/** The roster has come (or changed): every name on screen is told apart against it. */
export function setCompanyNames(fullNames: readonly string[]): void {
  const key = fullNames.map((name) => wordsOf(name).join(" ")).sort().join("|");
  if (key === useNamesStore.getState().key) return;
  useNamesStore.setState({ index: indexNames(fullNames), key });
}

/** The name to show, against the company's names known so far. */
export function shortName(fullName: string | null | undefined): string {
  return shortNameIn(fullName, useNamesStore.getState().index);
}

/**
 * Changes when the company's names do: a screen that builds names into memoised lines keeps
 * it among the memo's inputs, so «Ерлан» becomes «Ерлан Б.» once the roster has come.
 */
export function useNamesKey(): string {
  return useNamesStore((state) => state.key);
}
