"use client";

import { useEffect } from "react";

/**
 * The perf half of the mascot's contract (D-45, DESIGN §3: «полная пауза вне вьюпорта»).
 * A face that has scrolled away still costs the compositor a tick per frame, and a list of
 * people or tasks can hold a dozen of them. One observer for the whole document marks every
 * mascot that leaves the viewport with `data-idle`; globals.css stops its keyframes there.
 *
 * It lives outside `Mascot` on purpose: the face itself stays a server component, so an
 * avatar in a list costs no hydration. New faces are picked up from the nodes React adds,
 * never by re-scanning the document.
 */
export function MascotPower() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const seen = new WeakSet<Element>();
    const view = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // `data-idle` — not `hidden`: the face keeps its pose, only the keyframes stop
          if (entry.isIntersecting) entry.target.removeAttribute("data-idle");
          else entry.target.setAttribute("data-idle", "");
        }
      },
      // a face just below the fold starts moving before the eye reaches it
      { rootMargin: "80px" },
    );

    const watch = (root: ParentNode) => {
      for (const face of root.querySelectorAll("svg.mascot")) {
        if (seen.has(face)) continue;
        seen.add(face);
        view.observe(face);
      }
    };
    watch(document);

    const added = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches("svg.mascot") && !seen.has(node)) {
            seen.add(node);
            view.observe(node);
          } else {
            watch(node);
          }
        }
      }
    });
    added.observe(document.body, { childList: true, subtree: true });

    return () => {
      added.disconnect();
      view.disconnect();
    };
  }, []);

  return null;
}
