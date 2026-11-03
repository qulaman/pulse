/**
 * The desk's keyboard (D-153 §3). Keys are matched by `event.code` — the physical key — so a
 * Russian layout presses the same «A» as an English one.
 */

/** The order line's field: Ctrl/Cmd+K and «/» put the caret there. */
export const COMMAND_FIELD_ID = "desk-command";

type TargetLike = { tagName?: string; type?: string; isContentEditable?: boolean } | null;

const NOT_TYPED = new Set(["button", "checkbox", "radio", "submit", "reset", "range", "color", "file"]);

/** The key went to a field the person is typing in: the desk's letters must leave it alone. */
export function isTypingTarget(target: EventTarget | TargetLike): boolean {
  const el = target as TargetLike;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? "").toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") return !NOT_TYPED.has((el.type ?? "text").toLowerCase());
  return false;
}

/** A plain key: no Ctrl, Cmd or Alt held (Shift is a letter's own business). */
export function isPlainKey(event: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** Ctrl/Cmd+K, or «/» outside a field: go to the order line. */
export function isCommandKey(event: { code: string; key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget | null }): boolean {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === "KeyK") return true;
  return isPlainKey(event) && (event.code === "Slash" || event.key === "/") && !isTypingTarget(event.target);
}

/** Browser only: the caret into the order line; false — there is none (the secretary's desk). */
export function focusCommandLine(): boolean {
  const field = document.getElementById(COMMAND_FIELD_ID);
  if (!field) return false;
  field.focus();
  return true;
}
