/**
 * What has just been sent leaves upwards (D-166): a copy of each card flies off the top of the
 * screen, one after another, fanning out a little — while the cards themselves are already gone
 * from the data. The copies live in a layer of their own on <body>, so the flight never waits for
 * the screen under it and is not cut short when the cards unmount on landing (principle 1a).
 *
 * Transform and opacity only, by WAAPI on the compositor; the layer removes itself when the last
 * copy is out. Under «уменьшить движение» nothing flies. Returns a function that shows the cards
 * again — for a send that came back with an error.
 */
export function flyAway(nodes: HTMLElement[], { stagger = 55, duration = 560 } = {}): () => void {
  const restore = () => {
    for (const node of nodes) node.style.visibility = "";
  };
  if (nodes.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return restore;

  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("data-fly-layer", "");
  layer.style.cssText = "position:fixed;inset:0;z-index:60;pointer-events:none;overflow:hidden";
  document.body.appendChild(layer);

  let flying = nodes.length;
  const landed = () => {
    flying -= 1;
    if (flying === 0) layer.remove();
  };

  nodes.forEach((node, i) => {
    const rect = node.getBoundingClientRect();
    const ghost = node.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id");
    for (const child of ghost.querySelectorAll("[id]")) child.removeAttribute("id");
    ghost.style.position = "fixed";
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.margin = "0";
    ghost.style.willChange = "transform, opacity";
    layer.appendChild(ghost);
    node.style.visibility = "hidden";

    // a fan: every other card to the other side, each a little further and more turned
    const side = i % 2 === 0 ? -1 : 1;
    const dx = side * (10 + 12 * i);
    const turn = side * (3 + 1.5 * i);
    const rise = rect.bottom + 80;
    const flight = ghost.animate(
      [
        { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
        { transform: `translate(${(dx * 0.2).toFixed(1)}px, 10px) rotate(${(turn * 0.2).toFixed(1)}deg) scale(0.98)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${dx}px, ${-rise}px) rotate(${turn}deg) scale(0.84)`, opacity: 0 },
      ],
      // a wind-up, then gathering speed as it goes (D-131: what leaves accelerates)
      { duration, delay: i * stagger, easing: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "both" },
    );
    flight.onfinish = () => {
      ghost.remove();
      landed();
    };
    flight.oncancel = flight.onfinish;
  });
  return restore;
}
