/**
 * What the desk remembers of its frame in this browser (D-154 wave 3): the side navigation folded
 * to icons, and the width of the right-hand panel. localStorage keeps both — every access in
 * try/catch: a private window or blocked site data simply forgets. The fold is mirrored into a
 * cookie, so the layout draws the navigation as it was left and a wide frame never flashes into
 * a narrow one on load.
 */

export const NAV_WIDE = 232;
export const NAV_ICONS = 64;

export const PANEL_MIN = 360;
export const PANEL_MAX = 720;
export const PANEL_DEFAULT = 440;
/** What a panel always leaves to the list beside it. */
export const LIST_MIN = 480;

/** The cookie the layout reads: «icons» — folded. */
export const NAV_COOKIE = "desk_nav";
const NAV_KEY = "pulse.desk.nav";
const PANEL_KEY = "pulse.desk.panel";
const YEAR_S = 365 * 24 * 60 * 60;

/** Who draws from the remembered frame: the shell reads it through `useSyncExternalStore`. */
const listeners = new Set<() => void>();

export function subscribeFrame(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function changed(): void {
  for (const listener of listeners) listener();
}

/** The page's own memory: without storage the frame still answers until the window goes. */
let navMemory: boolean | null = null;
let panelMemory: number | null = null;

/** The panel stays between a readable column and half a laptop screen. */
export function clampPanel(width: number): number {
  if (!Number.isFinite(width)) return PANEL_DEFAULT;
  return Math.min(PANEL_MAX, Math.max(PANEL_MIN, Math.round(width)));
}

/** The layout's reading of the cookie. */
export function navFoldedFromCookie(value: string | null | undefined): boolean {
  return value === "icons";
}

/** Browser only: the fold this browser remembers; null — nothing remembered (or no storage). */
export function readNavFolded(): boolean | null {
  try {
    const value = window.localStorage.getItem(NAV_KEY);
    return value === null ? navMemory : value === "icons";
  } catch {
    return navMemory;
  }
}

/** Browser only: remembers the fold, and tells the server through the cookie. */
export function writeNavFolded(folded: boolean): void {
  navMemory = folded;
  try {
    window.localStorage.setItem(NAV_KEY, folded ? "icons" : "wide");
  } catch {
    // no storage: the cookie still carries it
  }
  writeNavCookie(folded);
  changed();
}

/** Browser only: the cookie the layout reads, so the next load is drawn the same. */
export function writeNavCookie(folded: boolean): void {
  document.cookie = `${NAV_COOKIE}=${folded ? "icons" : "wide"}; Max-Age=${YEAR_S}; Path=/; SameSite=Lax`;
}

/** Browser only: the panel's remembered width, clamped; null — none. */
export function readPanelWidth(): number | null {
  try {
    const value = window.localStorage.getItem(PANEL_KEY);
    return value === null ? panelMemory : clampPanel(Number(value));
  } catch {
    return panelMemory;
  }
}

export function writePanelWidth(width: number): void {
  panelMemory = clampPanel(width);
  try {
    window.localStorage.setItem(PANEL_KEY, String(clampPanel(width)));
  } catch {
    // forgotten with the window: the panel opens at its default next time
  }
  changed();
}
