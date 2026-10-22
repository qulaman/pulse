/** The nearest box that scrolls `node` — a sheet's body, a band — or null when it is the window. */
export function scrollerOf(node: HTMLElement): HTMLElement | null {
  for (let box = node.parentElement; box && box !== document.body; box = box.parentElement) {
    const { overflowY } = getComputedStyle(box);
    if ((overflowY === "auto" || overflowY === "scroll") && box.scrollHeight > box.clientHeight) return box;
  }
  return null;
}

/** How long each field's text was at its last fit: only a shorter text needs the field shrunk. */
const fitted = new WeakMap<HTMLTextAreaElement, number>();

/**
 * A growing field as tall as its words (up to `max`; `extra` — what the height counts beyond the
 * text, a border). Measuring a smaller height means making the field `auto` for an instant, and
 * for that instant the page is shorter by everything past one line: WebKit clamped the scroll of
 * a page read to its end, the height came back, the text sat lower and the browser pulled it back
 * to the caret — on an iPhone the page shook by hundreds of pixels on every letter (2026-10-22).
 * So a growing text only grows the field, never through `auto`; a text that got shorter shrinks
 * it, and the scroll of the window and of the field's own scroller is put back before the frame.
 */
export function fitHeight(node: HTMLTextAreaElement, max = Number.POSITIVE_INFINITY, extra = 0) {
  const length = node.value.length;
  const before = fitted.get(node);
  fitted.set(node, length);
  if (before !== undefined && length >= before) {
    if (node.scrollHeight > node.clientHeight) node.style.height = `${Math.min(node.scrollHeight + extra, max)}px`;
    return;
  }
  const box = scrollerOf(node);
  const windowY = window.scrollY;
  const boxY = box?.scrollTop ?? 0;
  node.style.height = "auto";
  node.style.height = `${Math.min(node.scrollHeight + extra, max)}px`;
  if (window.scrollY !== windowY) window.scrollTo(window.scrollX, windowY);
  if (box && box.scrollTop !== boxY) box.scrollTop = boxY;
}
