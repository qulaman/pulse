/**
 * One person, one set of moves on the whole desk (D-194): the circle's card on «Сегодня», the
 * card under a tile of «Команда», the panel of its list, the person's page and «Дневник» in
 * «Отчёты» all ask here, so a person opens the same way everywhere — the same moves in the same
 * order, minus the one that is the place itself (no «Карточка» on the card's page, no «Отчёты
 * человека» in their diary). Pure: the words, the order and who may do what; the screens attach
 * the doing (components/desk/team/PersonMoves.tsx).
 *
 * The order: on the head — «Дать задачу», «Вернуть в команду», «Изменить», «Карточка»; under «⋯» —
 * where their work lives («Задачи человека», «Отчёты человека», «Начислить очки…»), today's
 * availability, the login, and the move that ends something, last and red.
 */
import { canChangeAccess, canEditPerson, canResetLogin, type Who } from "@/lib/people/access";
import { isTeamMember } from "@/lib/people/team";
import type { Database } from "@/lib/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type MovePerson = Pick<Profile, "id" | "role" | "is_active" | "availability">;

/** Where the person is open: the moves that would only lead back here are left out. */
export type MovePlace = "today" | "card" | "panel" | "page" | "diary";

export type MoveKey = "give" | "revive" | "edit" | "card" | "tasks" | "reports" | "award" | "vacation" | "sick" | "back" | "login" | "pass" | "remove";

export type Move = {
  key: MoveKey;
  label: string;
  /** The key that does it where the screen binds it (T, E, Enter, Del). */
  hint?: string;
  danger?: boolean;
};

export type MoveContext = {
  place: MovePlace;
  /** Who looks: the director or the secretary (the desk's two roles). */
  viewer: Who;
  /** The company's points game is on. */
  pointsOn: boolean;
  /** The company's daily reports are on (unknown — taken as on). */
  reportsOn?: boolean;
  /** Open work still on a person who left — «Передать задачи…» shows while there is some. */
  held?: number;
};

export type PersonMoveSet = {
  /** The buttons of the head, in this order. */
  main: Move[];
  /** «⋯», in this order; "separator" between the parts. */
  more: (Move | "separator")[];
};

/** A person at work who is not the wall. */
const works = (person: MovePerson) => person.is_active && person.role !== "tv";

export function personMoves(person: MovePerson, ctx: MoveContext): PersonMoveSet {
  const { viewer, place } = ctx;
  const director = viewer.role === "director";
  const member = isTeamMember(person);
  const kiosk = person.role === "tv";
  const mayEdit = canEditPerson(viewer, person);
  const access = canChangeAccess(viewer, person);

  const main: Move[] = [];
  // a director gets no orders here, the wall none at all, and nobody gives one to themselves
  if (director && works(person) && person.role !== "director" && person.id !== viewer.id) main.push({ key: "give", label: "Дать задачу", hint: "T" });
  if (!person.is_active && access) main.push({ key: "revive", label: kiosk ? "Включить экран" : "Вернуть в команду" });
  if (mayEdit) main.push({ key: "edit", label: "Изменить", hint: "E" });
  if (place !== "page") main.push({ key: "card", label: "Карточка", hint: "Enter" });

  const work: Move[] = [];
  if (director && works(person)) work.push({ key: "tasks", label: "Задачи человека" });
  if (director && member && ctx.reportsOn !== false && place !== "diary") work.push({ key: "reports", label: "Отчёты человека" });
  if (director && member && ctx.pointsOn) work.push({ key: "award", label: "Начислить очки…" });

  // today's availability — a fact of the team, so of a member only (D-99)
  const away: Move[] = !(mayEdit && member)
    ? []
    : person.availability === "active"
      ? [
          { key: "vacation", label: "В отпуске с сегодня" },
          { key: "sick", label: "На больничном с сегодня" },
        ]
      : [{ key: "back", label: "На работе с сегодня" }];

  const login: Move[] = [];
  if (person.is_active && canResetLogin(viewer, person)) login.push({ key: "login", label: "Выдать код входа…" });
  if (!person.is_active && director && access && (ctx.held ?? 0) > 0) login.push({ key: "pass", label: "Передать задачи…" });

  const end: Move[] = access
    ? [{ key: "remove", label: person.is_active ? (kiosk ? "Выключить экран…" : "Удалить…") : "Удалить насовсем…", hint: "Del", danger: true }]
    : [];

  const more: (Move | "separator")[] = [];
  for (const part of [work, away, login, end]) {
    if (part.length === 0) continue;
    if (more.length > 0) more.push("separator");
    more.push(...part);
  }
  return { main, more };
}

/** Every move in one list — the right button's menu: the head's moves first, then «⋯». */
export function allMoves(set: PersonMoveSet): (Move | "separator")[] {
  return set.main.length > 0 && set.more.length > 0 ? [...set.main, "separator", ...set.more] : [...set.main, ...set.more];
}
