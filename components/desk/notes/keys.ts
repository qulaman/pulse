"use client";

import { useEffect, useRef, type RefObject } from "react";

import { keysTaken } from "@/components/desk/ui/layers";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import type { Note } from "@/lib/notes/queries";

import { CAPTURE_ID } from "./Capture";
import { isThought, type NoteActions } from "./useNoteActions";

/** The stream's views: the thoughts, what they became, the bin (boards are a section of their own, D-177). */
export type NotesTab = "notes" | "converted" | "trash";

export const NOTES_TABS: readonly NotesTab[] = ["notes", "converted", "trash"];

/** The phone's `?tab` (`active`, D-102) and the desk's own words lead to the same view. */
export function tabOf(value: string | null): NotesTab {
  if (value === "active") return "notes";
  return NOTES_TABS.includes(value as NotesTab) ? (value as NotesTab) : "notes";
}

/** What the bar or a key asked to open for a note: a menu under its button, or a sheet. */
export type Intent = { id: string; kind: "assign" | "remind" | "remind-custom" | "board" | "board-all" | "split" | "more" };

/** Several chosen: from `from` to `to` in the list's order. */
export function pickRun(order: readonly string[], from: string, to: string): Set<string> {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return new Set([to]);
  return new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1));
}

const NOBODY: ReadonlySet<string> = new Set();

/** What the keys of «Заметки» read and move — the page as it is this render. */
export type NotesKeysState = {
  tab: NotesTab;
  setTab: (tab: NotesTab) => void;
  /** The notes in the order the list shows them. */
  order: readonly string[];
  selectedId: string | null;
  /** `fromKeys` — the arrows: a quick hand sees each note at once (D-184). */
  select: (id: string | null, fromKeys?: boolean) => void;
  picked: ReadonlySet<string>;
  setPicked: (picked: ReadonlySet<string>) => void;
  /** Where a Shift-run of choices starts. */
  anchor: RefObject<string | null>;
  pickedNotes: () => Note[];
  noteById: ReadonlyMap<string, Note>;
  actions: NoteActions;
  setIntent: (intent: Intent | null) => void;
  search: RefObject<HTMLInputElement | null>;
};

function focusRow(id: string) {
  const node = document.getElementById(`nb-row-${id}`);
  if (!node) return;
  node.focus({ preventScroll: true });
  node.scrollIntoView({ block: "nearest" });
}

/** One key on the page: true — it was the page's. `toCapture` — «N» switched the tab to reach the capture. */
function notesKey(event: KeyboardEvent, s: NotesKeysState, toCapture: () => void): boolean {
  const code = event.code;
  const typing = isTypingTarget(event.target);
  // Ctrl+F — the search, from anywhere (the note's text included)
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && code === "KeyF") {
    s.search.current?.focus();
    s.search.current?.select();
    return true;
  }
  if (typing || !isPlainKey(event) || (event.repeat && code !== "ArrowDown" && code !== "ArrowUp")) return false;
  const active = document.activeElement;
  const inList = Boolean(active?.closest("[data-notes-list]"));
  const fromList = !active || active === document.body || inList;
  // N — the capture card: a thought is written there (Alt+N is the shell's quick thought, D-177)
  if (code === "KeyN" && !event.shiftKey) {
    if (s.tab === "notes") document.getElementById(CAPTURE_ID)?.focus();
    else toCapture();
    return true;
  }
  if (!fromList) return false;
  if ((code === "Digit1" || code === "Digit2" || code === "Digit3") && !event.shiftKey) {
    s.setTab(NOTES_TABS[Number(code.slice(5)) - 1]);
    return true;
  }
  if (code === "Escape" && s.picked.size > 0) {
    s.setPicked(NOBODY);
    return true;
  }
  const at = s.selectedId ? s.order.indexOf(s.selectedId) : -1;
  if (code === "ArrowDown" || code === "ArrowUp") {
    if (s.order.length === 0) return false;
    const next = s.order[code === "ArrowDown" ? Math.min(s.order.length - 1, at + 1) : Math.max(0, at < 0 ? 0 : at - 1)];
    if (event.shiftKey) {
      const from = s.anchor.current ?? s.selectedId ?? next;
      s.anchor.current = from;
      const run = pickRun(s.order, from, next);
      s.setPicked(run.size > 1 ? run : NOBODY);
    } else {
      s.anchor.current = next;
      if (s.picked.size > 0) s.setPicked(NOBODY);
    }
    s.select(next, true);
    if (fromList) focusRow(next);
    return true;
  }
  if (event.shiftKey) return false;
  if (s.picked.size > 1) {
    const list = s.pickedNotes();
    if (code === "Delete" || (code === "Backspace" && inList)) {
      if (s.tab === "trash") s.actions.purge(list);
      else s.actions.binMany(list);
      return true;
    }
    if (code === "KeyB" && s.tab === "notes") {
      s.setIntent({ id: "picked", kind: "board" });
      return true;
    }
    if (code === "KeyR" && s.tab === "notes") {
      s.setIntent({ id: "picked", kind: "remind" });
      return true;
    }
    return false;
  }
  const note = s.selectedId ? s.noteById.get(s.selectedId) : undefined;
  if (!note) return false;
  // Backspace only from the list itself: a page with nothing focused never bins by a stray key
  if (code === "Delete" || (code === "Backspace" && inList)) {
    if (note.deleted_at !== null) s.actions.purge([note]);
    else s.actions.bin(note);
    return true;
  }
  if (!isThought(note)) return false;
  const empty = !note.text.trim();
  if (code === "Enter") {
    const body = document.querySelector<HTMLTextAreaElement>('[data-testid="desk-note"] [data-testid="note-editor"]');
    const title = document.querySelector<HTMLTextAreaElement>('[data-testid="desk-note"] [data-testid="note-title"]');
    const field = body && body.value ? body : (title ?? body);
    if (field) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }
    return true;
  }
  if (code === "KeyT" && !empty) s.setIntent({ id: note.id, kind: "assign" });
  else if (code === "KeyR") s.setIntent({ id: note.id, kind: "remind" });
  else if (code === "KeyB" && !empty) s.setIntent({ id: note.id, kind: "board" });
  else if (code === "KeyA" && !empty) s.actions.announce(note);
  else if (code === "KeyP") s.actions.pin(note);
  else return false;
  return true;
}

/**
 * The keyboard of «Заметки» (D-177): ↑/↓ through the rows (Shift — several), Enter into the note,
 * N — the capture, Ctrl+F — the search, 1–3 — the tabs, T/R/B/A/P/Del — the chosen note's actions.
 * Quiet while a dialog, a sheet, a popover or a menu of the desk holds the keys (`keysTaken`).
 */
export function useNotesKeys(state: NotesKeysState) {
  const live = useRef(state);
  useEffect(() => {
    live.current = state;
  });

  // «N» from another tab: the capture is focused once the thoughts are drawn
  const focusCapture = useRef(false);
  useEffect(() => {
    if (state.tab !== "notes" || !focusCapture.current) return;
    focusCapture.current = false;
    document.getElementById(CAPTURE_ID)?.focus();
  }, [state.tab]);

  useEffect(() => {
    const toCapture = () => {
      focusCapture.current = true;
      live.current.setTab("notes");
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || keysTaken()) return;
      if (notesKey(event, live.current, toCapture)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
