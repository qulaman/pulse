/**
 * The order line as a palette (D-154 wave 3): while the director types, what the words may also
 * mean — a section to go to, a person's card, a task already given — from data the desk has
 * already read. Nothing here is chosen by itself — but a move named in words (`matchCommands`):
 * otherwise Enter with no row picked still sends the order. Pure: the line renders, this one matches.
 */

import { allFit, fits, foldRu, searchPeople, searchWords } from "@/lib/people/search";

/** @deprecated use `searchPeople` from lib/people/search */
export { searchPeople } from "@/lib/people/search";

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
  "/desk/ether": "эфир объявление новости сообщение",
  "/desk/reports": "отчет день",
  "/desk/calendar": "встречи мероприятия",
  "/desk/notes": "мысли напоминания блокнот",
  "/desk/boards": "доска совещание планёрка пункты стена",
  "/desk/screen": "тв стена телевизор",
  "/desk/settings": "компания словарь очки магазин",
  "/desk/profile": "аккаунт пароль уведомления выход",
};

/** Closed work: below the open in the palette, still found. */
const CLOSED = new Set(["done", "revoked", "declined"]);

/** The sections whose name (or its other words) fits every typed word; the name's own start first. */
export function matchSections<T extends PaletteSection>(query: string, sections: readonly T[], limit = 3): T[] {
  const typed = searchWords(query);
  const head = foldRu(query.trim());
  if (!head) return [];
  return sections
    .filter((section) => allFit(typed, [...searchWords(section.label), ...searchWords(SECTION_WORDS[section.href])]))
    .sort((a, b) => Number(!foldRu(a.label).startsWith(head)) - Number(!foldRu(b.label).startsWith(head)))
    .slice(0, limit);
}

/**
 * Tasks whose title or assignee fits every typed word (two letters at least): the open ones
 * first, a title that starts with the words before one that only has them, the newest first.
 * `found` — the ids the server's search brought: it has already matched them (`useTaskSearch`).
 */
export function matchTasks<T extends PaletteTask>(query: string, tasks: readonly T[], limit = 5, found: ReadonlySet<string> = new Set()): T[] {
  const head = foldRu(query.trim());
  if (head.length < 2) return [];
  const typed = searchWords(query);
  const hits = tasks.filter((task) => found.has(task.id) || allFit(typed, [...searchWords(task.title), ...searchWords(task.assignee)]));
  const rank = (task: T) => (CLOSED.has(task.status) ? 2 : 0) + (foldRu(task.title).startsWith(head) ? 0 : 1);
  hits.sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at));
  return hits.slice(0, limit);
}

/**
 * What the server's search needs of the typed words: «смета ерлан» is the word «смета» in a title
 * of Ерлан's. The search reads titles only, so the names go to the assignee. Nothing but names —
 * «ерлан» alone — stays a title's word: there is nothing else to look for.
 */
export function taskLookup(query: string, people: readonly PalettePerson[]): { text: string; assignees: string[] } {
  const typed = searchWords(query);
  const assignees = new Set<string>();
  const rest = typed.filter((word) => {
    const named = people.filter((person) => searchWords(person.full_name).some((name) => fits(word, name)));
    for (const person of named) assignees.add(person.id);
    return named.length === 0;
  });
  return rest.length > 0 && assignees.size > 0 ? { text: rest.join(" "), assignees: [...assignees] } : { text: query, assignees: [] };
}

/**
 * A move the director names in words rather than an order (D-160): «новый сотрудник», «добавить
 * человека», «удалить Ерлана». Typed as an order they went to the parser and came back «не
 * разобрал» — or as a task. `lead` — the words start with the verb and are short: the line picks
 * the row by itself, so Enter does the move; anything longer stays an order unless picked.
 */
export type PaletteCommand<T extends PalettePerson = PalettePerson> =
  | { kind: "new"; lead: boolean }
  | { kind: "list"; lead: false }
  | { kind: "remove"; person: T; lead: boolean }
  | { kind: "team"; lead: false };

const NEW_VERB = /^(нов|добав|нан|завед|созд|принят|прием)/;
const PERSON_WORD = /^(сотрудн|человек|работник|кадр|людей|люди)/;
const REMOVE_VERB = /^(удал|увол|убер|убра|исключ)/;
/** Words around a name in «удалить сотрудника Ерлана из команды» that are not the name. */
const FILLER = /^(сотрудн|человек|работник|из|команд|насовсем|карточк|профил)/;

export function matchCommands<T extends PalettePerson>(query: string, people: readonly T[]): PaletteCommand<T>[] {
  const typed = searchWords(query);
  if (typed.length === 0) return [];
  const short = typed.length <= 5;
  if (NEW_VERB.test(typed[0]) && typed.some((word) => PERSON_WORD.test(word))) {
    return [{ kind: "new", lead: short }, { kind: "list", lead: false }];
  }
  if (typed[0] === "новый" || typed[0] === "новая" || (typed.length === 1 && PERSON_WORD.test(typed[0]) && typed[0].length >= 6)) {
    return [{ kind: "new", lead: false }];
  }
  if (REMOVE_VERB.test(typed[0])) {
    const name = typed.slice(1).filter((word) => !FILLER.test(word));
    if (name.length === 0) return typed.some((word) => PERSON_WORD.test(word)) ? [{ kind: "team", lead: false }] : [];
    const found = searchPeople(people, name.join(" "), 3);
    return found.map((person, index) => ({ kind: "remove", person, lead: short && index === 0 && found.length === 1 }));
  }
  return [];
}
