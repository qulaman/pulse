import type { Role } from "@/lib/routes";

/**
 * The desktop of the director and the secretary (D-153): a working surface of its own under
 * `/desk/*`, over the same data and the same session. Who lands where, which phone address has
 * a desktop twin, and what the side navigation lists — one table for `proxy.ts`, the desk's
 * layout and its shell.
 */

export type DeskRole = "director" | "secretary";

export function isDeskRole(role: Role | undefined): role is DeskRole {
  return role === "director" || role === "secretary";
}

/** The desk's home of each role: the director's day at a glance (D-154), the secretary's «Секретарь» with her queue. */
export const DESK_HOME: Record<DeskRole, string> = {
  director: "/desk/today",
  secretary: "/desk/errands",
};

export function deskHomeFor(role: Role | undefined): string {
  return role === "secretary" ? DESK_HOME.secretary : DESK_HOME.director;
}

export type DeskBadge = "tasks" | "errands" | "calendar" | "rating" | "shop";

/**
 * `key` — the letter after «G» that goes there (D-154 wave 3), matched by the physical key.
 * `group` — the sections stand in groups with air between them (D-214): the work, the people, the
 * points game (D-215), the plans, what is on air, the setup; a list is written group by group, top
 * to bottom.
 */
export type DeskNavGroup = "work" | "people" | "game" | "plans" | "air" | "setup";
export type DeskNavItem = {
  href: string;
  label: string;
  group: DeskNavGroup;
  badge?: DeskBadge;
  key?: string;
  /** A section of the points game: the navigation lists it only while the company plays (`pointsEnabled`). */
  game?: true;
};

/**
 * The side navigation by role. The secretary sees only her own tasks under RLS (`tasks_select`),
 * so tasks, the inbox, the reports, the notes and the wall are the director's alone (D-153 §1).
 * «Профиль» stands apart at the bottom of the bar — it is not in these lists.
 */
export const DESK_NAV: Record<DeskRole, DeskNavItem[]> = {
  // One thing, one word (D-194): a section is named what its screen and the «Сегодня» block
  // call it. «Ждут вас» carries no count of its own: it is the same number as «Задачи» (D-154)
  director: [
    { href: "/desk/today", label: "Сегодня", group: "work", key: "S" },
    { href: "/desk/tasks", label: "Задачи", group: "work", badge: "tasks", key: "T" },
    { href: "/desk/inbox", label: "Ждут вас", group: "work", key: "I" },
    { href: "/desk/team", label: "Команда", group: "people", key: "K" },
    { href: "/desk/reports", label: "Отчёты", group: "people", key: "O" },
    { href: "/desk/errands", label: "Секретарь", group: "people", badge: "errands", key: "Z" },
    // the points game (D-215): who leads, and what the points buy — each counts what waits in it
    { href: "/desk/rating", label: "Рейтинг", group: "game", badge: "rating", key: "R", game: true },
    { href: "/desk/shop", label: "Магазин", group: "game", badge: "shop", key: "M", game: true },
    { href: "/desk/calendar", label: "Календарь", group: "plans", badge: "calendar", key: "C" },
    { href: "/desk/notes", label: "Заметки", group: "plans", key: "N" },
    { href: "/desk/boards", label: "Доски", group: "plans", key: "D" },
    { href: "/desk/ether", label: "Эфир", group: "air", key: "A" },
    { href: "/desk/screen", label: "Экран", group: "air", key: "E" },
    { href: "/desk/settings", label: "Настройки", group: "setup", key: "H" },
  ],
  secretary: [
    { href: "/desk/errands", label: "Секретарь", group: "work", badge: "errands", key: "Z" },
    { href: "/desk/team", label: "Команда", group: "people", key: "K" },
    { href: "/desk/calendar", label: "Календарь", group: "plans", badge: "calendar", key: "C" },
    { href: "/desk/ether", label: "Эфир", group: "air", key: "A" },
    { href: "/desk/settings", label: "Настройки", group: "setup", key: "H" },
  ],
};

export const DESK_PROFILE = "/desk/profile";

/** «G P» — the profile, at the foot of the navigation for both roles. */
export const DESK_PROFILE_KEY = "P";

/**
 * Where «G» and then this physical key goes for the role (D-154 wave 3): `KeyT` → «Задачи».
 * Null — the letter is no section of the role; the key is left to the screen.
 */
export function chordHref(code: string, role: DeskRole): string | null {
  const match = /^Key([A-Z])$/.exec(code);
  if (!match) return null;
  if (match[1] === DESK_PROFILE_KEY) return DESK_PROFILE;
  return DESK_NAV[role].find((item) => item.key === match[1])?.href ?? null;
}

/**
 * Desk screens only the director has (D-153 §1); the secretary's direct address leads to her home.
 * «Лаборатория» is here too since 2026-11-04: on the desk it is the developers', see `deskDevToolsOpen`.
 */
const DIRECTOR_ONLY = [
  "/desk/today",
  "/desk/tasks",
  "/desk/inbox",
  "/desk/reports",
  "/desk/notes",
  "/desk/boards",
  "/desk/screen",
  "/desk/settings/lab",
  "/desk/settings/data",
  "/desk/settings/points",
  "/desk/rating",
  "/desk/shop",
];

const within = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/**
 * «Лаборатория» and «Данные» of the desk's settings: the developers' tools, hidden from clients
 * (owner, 2026-11-04). The director of a company with `settings.dev_tools`; the secretary never.
 */
export function deskDevToolsOpen(role: Role | undefined, devTools: boolean): boolean {
  return role === "director" && devTools;
}

/** May this role see this desk screen; `/desk` itself is everybody's (it only leads home). */
export function deskAllows(pathname: string, role: Role | undefined): boolean {
  if (!isDeskRole(role)) return false;
  if (role === "director") return true;
  return !DIRECTOR_ONLY.some((base) => within(pathname, base));
}

/** The nav item a desk address lights: the longest href it lies under. */
export function deskNavActive(pathname: string, role: DeskRole): string | null {
  const items = [...DESK_NAV[role].map((item) => item.href), DESK_PROFILE];
  let best: string | null = null;
  for (const href of items) {
    if (within(pathname, href) && (!best || href.length > best.length)) best = href;
  }
  return best;
}

/** The query keys a phone address hands over to its desktop twin; everything else is dropped. */
function keep(search: string, names: readonly string[]): URLSearchParams {
  const from = new URLSearchParams(search);
  const to = new URLSearchParams();
  for (const name of names) {
    const value = from.get(name);
    if (value !== null && value !== "") to.set(name, value);
  }
  return to;
}

function withQuery(pathname: string, query: URLSearchParams): string {
  const text = query.toString();
  return text ? `${pathname}?${text}` : pathname;
}

const ID = "([^/]+)";

/**
 * The desktop twin of a phone address for this role, or null — the address has no desk screen
 * for the role and opens as it is (D-153 §2). `search` — the address's query string, with or
 * without its «?». Only the keys the desk screen reads go along.
 */
export function deskRouteFor(pathname: string, search: string, role: Role | undefined): string | null {
  if (!isDeskRole(role)) return null;
  const director = role === "director";
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const none = new URLSearchParams();

  switch (path) {
    // Пульс and an unsent draft open on the director's day; «Задачи» on the tasks dashboard
    case "/pulse":
    case "/confirm":
      return director ? DESK_HOME.director : null;
    case "/sent":
      return director ? "/desk/tasks" : null;
    case "/people":
      return "/desk/team";
    case "/people/new":
      return "/desk/team/new";
    case "/settings":
      return withQuery("/desk/settings", keep(search, ["tab"]));
    case "/settings/dictionary":
      return withQuery("/desk/settings/dictionary", keep(search, ["tab"]));
    case "/lab":
      return withQuery("/desk/settings/lab", keep(search, ["tab"]));
    case "/admin":
      return director ? withQuery("/desk/settings/data", keep(search, ["table"])) : null;
    case "/secretary":
      return withQuery("/desk/errands", keep(search, ["e"]));
    case "/calendar":
      // a meeting's push carries `?e=<event>`; the desk calendar opens it
      return withQuery("/desk/calendar", keep(search, ["e"]));
    case "/notes": {
      if (!director) return null;
      // the phone's «Доски» tab is a section of its own on the desk (D-177)
      if (keep(search, ["tab"]).get("tab") === "boards") return "/desk/boards";
      // a reminder's push carries `?n=<note>`; the desk notes open it
      return withQuery("/desk/notes", keep(search, ["tab", "n"]));
    }
    case "/screen":
      return director ? "/desk/screen" : null;
    case "/reports":
      // the phone's feed filters mean the same on the desk (D-198); `?tab=period` opens the табель there
      return director ? withQuery("/desk/reports", keep(search, ["tab", "who", "only", "day"])) : null;
    case "/rating":
      // a dispute's push is `/rating#disputes`: the browser carries the hash over the redirect
      return director ? "/desk/rating" : null;
    case "/shop":
      // the shop's pushes are orders to hand out
      return director ? "/desk/shop" : null;
    case "/feed":
      return director ? null : "/desk/errands";
    case "/ether":
      // both read it on the phone; only the director's desk writes and deletes (RLS)
      return "/desk/ether";
    case "/profile":
      return DESK_PROFILE;
  }

  let match = new RegExp(`^/tasks/${ID}$`).exec(path);
  // the secretary's own task opens on its phone screen: the desk has no tasks for her
  if (match) return director ? withQuery("/desk/tasks", new URLSearchParams({ id: match[1] })) : null;
  match = new RegExp(`^/people/${ID}/edit$`).exec(path);
  if (match) return withQuery(`/desk/team/${match[1]}`, new URLSearchParams({ edit: "1" }));
  match = new RegExp(`^/people/${ID}$`).exec(path);
  if (match) return withQuery(`/desk/team/${match[1]}`, none);
  match = new RegExp(`^/notes/b/${ID}$`).exec(path);
  if (match) return director ? `/desk/boards/${match[1]}` : null;
  return null;
}

/**
 * Whether the address may have a desk twin for some desk role — the proxy asks for the role only
 * then, so every other address of a desktop browser costs nothing extra.
 */
export function mayHaveDeskRoute(pathname: string): boolean {
  return deskRouteFor(pathname, "", "director") !== null || deskRouteFor(pathname, "", "secretary") !== null;
}
