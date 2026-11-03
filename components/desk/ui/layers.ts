/**
 * The desk's floating layers in the order they opened (D-154 wave 3): a dialog, a popover inside
 * it, a menu inside that. Each listens to Esc on the window, and window listeners run in the
 * order they were added — so without this the oldest layer (the dialog) would take the Esc meant
 * for the list on top of it. A layer answers Esc only while it is the top one.
 */
const stack: number[] = [];
let seq = 0;

export function pushLayer(): number {
  seq += 1;
  stack.push(seq);
  return seq;
}

export function dropLayer(id: number) {
  const at = stack.indexOf(id);
  if (at >= 0) stack.splice(at, 1);
}

export function isTopLayer(id: number): boolean {
  return stack[stack.length - 1] === id;
}
