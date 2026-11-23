/**
 * How the desk's screen moves when its address changes (D-184). Read from where the screen was and
 * where it goes, never from what was clicked: a link, a key, the order line and the browser's own
 * «Назад» move it alike. The value is the `view-transition-class` the screen's <ViewTransition>
 * gets for that one change (components/desk/DeskShell.tsx); the looks are in app/desk/transitions.css.
 *
 * - `section-down` / `section-up` — another section, further down or up the navigation
 * - `deeper` / `back` — into a thing of the same section (a person, a board) and out of it
 * - `swap` — the same place, other content: a sibling page of a section without depth (Настройки)
 * - `none` — the address did not leave the screen (`?p=`, `?e=`), or it is not the desk's
 */
export type ScreenMove = "desk-section-down" | "desk-section-up" | "desk-deeper" | "desk-back" | "desk-swap" | "none";

/** Sections whose pages are siblings, not levels: their own list on the left switches them. */
const FLAT = new Set(["settings", "profile"]);

type Place = { section: string; depth: number; path: string };

function placeOf(pathname: string): Place | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "desk") return null;
  return { section: parts[1] ?? "", depth: Math.max(0, parts.length - 2), path: parts.join("/") };
}

/**
 * The move from `from` to `to`, both pathnames (no query). `order` — the sections as the role's
 * navigation lists them, top to bottom (`/desk/today`, `/desk/tasks` …); a section missing from it
 * (the profile at the foot, a screen reached by its address alone) changes in place.
 */
export function screenMove(from: string, to: string, order: readonly string[]): ScreenMove {
  const a = placeOf(from);
  const b = placeOf(to);
  if (!a || !b || a.path === b.path) return "none";
  if (a.section !== b.section) {
    const sections = order.map((href) => placeOf(href)?.section);
    const i = sections.indexOf(a.section);
    const j = sections.indexOf(b.section);
    if (i < 0 || j < 0) return "desk-swap";
    return j > i ? "desk-section-down" : "desk-section-up";
  }
  if (FLAT.has(a.section) || a.depth === b.depth) return "desk-swap";
  return b.depth > a.depth ? "desk-deeper" : "desk-back";
}

/**
 * The classes of a part of a screen that moves with a change inside the screen (D-184), by the
 * transition type its write carries (`writeDeskAddress(…, { type })`). A part stays one boundary —
 * no `key` — whatever it shows, so its old and new faces are one pair and cross-fade by adding
 * their light (app/desk/transitions.css): a pair of two boundaries, one going and one coming, let
 * the page's ground through in between — a blink.
 * - `desk-switch` — a view or a tab (`SWITCH_SWAP`);
 * - `desk-pick` — another thing open: the panel's content (`PANEL_PICK`), a note on its paper, the
 *   side of the calendar (`PICK_SWAP`);
 * - `desk-step-next` / `desk-step-prev` — a step through time: a week, a month, a day of «Сводка»
 *   slides the way it goes (`SWITCH_OR_STEP`).
 * Anything else that changes the part leaves it still.
 */
export const SWITCH_SWAP = { "desk-switch": "desk-switch-swap", default: "none" };
export const SWITCH_OR_STEP = { "desk-switch": "desk-switch-swap", "desk-step-next": "desk-slide-next", "desk-step-prev": "desk-slide-prev", default: "none" };
export const PANEL_PICK = { "desk-pick": "desk-pick-swap", default: "none" };
/** A pane that holds the open thing and also changes with a tab: a note on its paper. */
export const PICK_SWAP = { "desk-pick": "desk-pick-swap", "desk-switch": "desk-switch-swap", default: "none" };

/** The transition type of a step from `from` to `to` (dates or months as text): later — next. */
export function stepType(from: string, to: string): "desk-step-next" | "desk-step-prev" | undefined {
  if (from === to) return undefined;
  return to > from ? "desk-step-next" : "desk-step-prev";
}
