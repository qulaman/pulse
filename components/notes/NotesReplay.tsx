"use client";

import { useNotesReplay } from "@/lib/notes/replay";
import { useMe } from "@/lib/tasks/queries";

/**
 * Sends the notes the phone kept without network (D-95) from any screen of the director:
 * a thought dictated at a site without signal lands the moment the phone finds one.
 */
export function NotesReplay() {
  const me = useMe();
  useNotesReplay(me.data);
  return null;
}
