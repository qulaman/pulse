"use client";

import { ViewTransition, type ReactNode } from "react";

/** What flies between places on the desk: a person's circle and name, a task's or a board's title, a meeting. */
export type MorphPart = "face" | "name" | "task" | "board" | "event";

/** How each part flies (app/desk/transitions.css): a picture, a name by its height, a title by its width. */
const SHARE: Record<MorphPart, string> = {
  face: "desk-morph",
  name: "desk-morph-text",
  task: "desk-morph-title",
  board: "desk-morph-title",
  event: "desk-morph-title",
};

/**
 * One thing in several places at once in the eye (D-184): the tile, the card under the row and the
 * person's page carry the same name; a task's title its row and the panel; a board its tile and its
 * page — so a move between them flies the one thing across instead of hiding one and showing the
 * other. A name may stand on one element at a time — two at once and the browser drops the whole
 * transition — so the place left behind gives its name up while the thing is open there (`off`).
 * The `key` makes that a remount, and a remount is what pairs: the thing drops from the row into the
 * panel and goes back when the panel closes.
 */
export function Morph({ part, id, off = false, children }: { part: MorphPart; id: string; off?: boolean; children: ReactNode }) {
  return (
    <ViewTransition key={off ? "off" : "on"} name={off ? undefined : `desk-${part}-${id}`} share={SHARE[part]} default="none">
      {children}
    </ViewTransition>
  );
}
