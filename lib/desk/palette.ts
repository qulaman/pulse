/**
 * The order line as a palette (D-154 wave 3): while the director types, what the words may also
 * mean — a section to go to, a person's card, a task already given — from data the desk has
 * already read. Nothing here is chosen by itself: Enter with no row picked still sends the order.
 * Pure: the line renders, this one matches.
 */

import { fits, fold } from "./suggest";

export type PaletteSection = { href: string; label: string; key?: string };
export type PalettePerson = { id: string; full_name: string; position?: string | null; aliases?: string[] | null };
export type PaletteTask = { id: string; title: string; status: string; assignee: string | null; deadline: string | null; created_at: string };

/** Words a section is also looked for by: «тв» finds «Экран», «пароль» — «Профиль». */
const SECTION_WORDS: Record<string, string> = {
  "/desk/today": "главная пульс день дом",
  "/desk/tasks": "поручения приёмка",
  "/desk/inbox": "решения входящие ждут",
  "/desk/team": "люди сотрудники",
  "/desk/errands": "секретарь приёмная кофе посетитель",
  "/desk/reports": "отчет день",
  "/desk/calendar": "встречи мероприятия",
  "/desk/notes": "мысли доски",
  "/desk/screen": "тв стена телевизор",
  "/desk/settings": "компания словарь очки магазин",
  "/desk/profile": "аккаунт пароль уведомления выход",
};

/** Closed work: below the open in the palette, still found. */
const CLOSED = new Set(["done", "revoked", "declined"]);

function words(text: string | null | undefined): string[] {
  return fold(text ?? "")
    .split(/[^\p{L}\d]+/u)
    .filter(Boolean);
}

/** Every typed word fits some word of the item: «смет ерл» finds Ерлан's «Проверить смету». */
function allFit(typed: string[], haystack: string[]): boolean {
  return typed.length > 0 && typed.every((t) => haystack.some((w) => fits(t, w)));
}

/** The sections whose name (or its other words) fits every typed word; the name's own start first. */
export function matchSections<T extends PaletteSection>(query: string, sections: readonly T[], limit = 3): T[] {
  const typed = words(query);
  const head = fold(query.trim());
  if (!head) return [];
  return sections
    .filter((section) => allFit(typed, [...words(section.label), ...words(SECTION_WORDS[section.href])]))
    .sort((a, b) => Number(!fold(a.label).startsWith(head)) - Number(!fold(b.label).startsWith(head)))
    .slice(0, limit);
}

/**
 * People by any part of the name, an alias or the position — «ер б» finds «Ерлан Бекмуханов»,
 * «бух» the accountant (as the phone's picker, D-108); the first name's match first. An empty
 * query is everybody, in the roster's order.
 */
export function searchPeople<T extends PalettePerson>(people: readonly T[], query: string, limit = Infinity): T[] {
  const typed = words(query);
  if (typed.length === 0) return people.slice(0, limit);
  const scored: { person: T; score: number }[] = [];
  for (const person of people) {
    const names = words(person.full_name);
    const haystack = [...names, ...(person.aliases ?? []).flatMap((alias) => words(alias)), ...words(person.position)];
    if (!allFit(typed, haystack)) continue;
    scored.push({ person, score: names[0] && fits(typed[0], names[0]) ? 0 : names.some((w) => fits(typed[0], w)) ? 1 : 2 });
  }
  scored.sort((a, b) => a.score - b.score || a.person.full_name.localeCompare(b.person.full_name, "ru"));
  return scored.slice(0, limit).map((entry) => entry.person);
}

/**
 * Tasks whose title or assignee fits every typed word (two letters at least): the open ones
 * first, a title that starts with the words before one that only has them, the newest first.
 */
export function matchTasks<T extends PaletteTask>(query: string, tasks: readonly T[], limit = 5): T[] {
  const head = fold(query.trim());
  if (head.length < 2) return [];
  const typed = words(query);
  const hits = tasks.filter((task) => allFit(typed, [...words(task.title), ...words(task.assignee)]));
  const rank = (task: T) => (CLOSED.has(task.status) ? 2 : 0) + (fold(task.title).startsWith(head) ? 0 : 1);
  hits.sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at));
  return hits.slice(0, limit);
}
