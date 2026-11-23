/**
 * The desk's address arithmetic (D-184), apart from React so it is tested on its own:
 * `components/desk/DeskAddress.tsx` keeps the address as state, the screens build what they write
 * with `withParams`.
 */

/** A query patch: a string sets the name, `null` or "" drops it, `undefined` leaves it as it was. */
export type ParamsPatch = Record<string, string | null | undefined>;

/** `path?query` of `search` changed by `patch` — just `path` when nothing is left. */
export function withParams(path: string, search: string, patch: ParamsPatch): string {
  const next = new URLSearchParams(search);
  for (const [name, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null || value === "") next.delete(name);
    else next.set(name, value);
  }
  const text = next.toString();
  return text ? `${path}?${text}` : path;
}

/** The path and the query (without «?») of an address relative to `base`. */
export function splitAddress(href: string, base: string): { path: string; search: string } {
  const url = new URL(href, base);
  return { path: url.pathname, search: url.search.slice(1) };
}

/** One spelling of an address for comparing: Next's and the desk's alike. */
export function addressKey(path: string, search: string): string {
  return `${path}?${search}`;
}

/** The address the desk shows. */
export type DeskAddressState = {
  /** Next's address this state last took in. */
  seen: string;
  path: string;
  search: string;
};

/** The desk wrote an address of its own screen. */
export function wrote(was: DeskAddressState, path: string, search: string): DeskAddressState {
  return path === was.path ? { ...was, search } : was;
}

/**
 * Next's address moved to `path?fromNext`. When that is an address the desk wrote itself (`ours`),
 * Next has only caught up: the desk changes it on its own, inside its transition, and may already
 * be further. Anything else is Next's own move — a link, `router.push` — and the desk takes it.
 */
export function followNext(was: DeskAddressState, path: string, fromNext: string, ours: boolean): DeskAddressState {
  const seen = addressKey(path, fromNext);
  if (ours && path === was.path) return { ...was, seen };
  return { seen, path, search: fromNext };
}

/** How many of the desk's last writes are remembered as its own. */
export const WRITES_KEPT = 8;

/** The desk's last writes, newest last: `key` added, a repeat moved to the end, the oldest dropped. */
export function remember(list: readonly string[], key: string): string[] {
  return [...list.filter((k) => k !== key), key].slice(-WRITES_KEPT);
}

/** Names that switch a part of the screen (a tab, a view) and that pick the thing open in it. */
const SWITCH_NAMES = ["tab", "view"];
const PICK_NAMES = ["id", "e", "n", "p", "person"];

/**
 * The transition type of a move between two queries of one screen — Back and Forward through the
 * browser's history play what the step played forward: another tab or view — `desk-switch`,
 * another thing open — `desk-pick`, anything else — nothing.
 */
export function moveBetween(from: string, to: string): "desk-switch" | "desk-pick" | undefined {
  const a = new URLSearchParams(from);
  const b = new URLSearchParams(to);
  const changed = (name: string) => a.get(name) !== b.get(name);
  if (SWITCH_NAMES.some(changed)) return "desk-switch";
  if (PICK_NAMES.some(changed)) return "desk-pick";
  return undefined;
}
