"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { SearchField } from "@/components/desk/ui/Toolbar";
import { filterNotes, firstLine, splitNotes, whenRu } from "@/lib/notes/list";
import type { Note } from "@/lib/notes/queries";

/** The latest thoughts the picker shows before a search narrows them. */
const SHOWN = 40;

/**
 * «Добавить из мыслей…» of a board (D-177): the director's loose thoughts behind a button, never an
 * open panel beside the board — the room may be looking at this screen (owner's answer 8). A click
 * on «＋» puts the thought at the bottom of the board as a point (`useMovePoint`, the same as «На
 * доску» of the note); the dialog stays open for the next one. The search reads the loaded thoughts.
 */
export function ThoughtsPicker({ open, onClose, notes, now, onAdd }: { open: boolean; onClose: () => void; notes: readonly Note[]; now: Date; onAdd: (note: Note) => void }) {
  const [query, setQuery] = useState("");
  const thoughts = useMemo(() => (open ? splitNotes(notes).active : []), [open, notes]);
  const shown = useMemo(() => filterNotes(thoughts, query).slice(0, SHOWN), [thoughts, query]);
  return (
    <Dialog open={open} onClose={onClose} title="Добавить из мыслей" width="md">
      <p className="-mt-1 text-[13px] leading-5 text-muted">Мысль станет пунктом в конце доски. Мысли видите только вы.</p>
      <div className="mt-3">
        <SearchField value={query} onChange={setQuery} placeholder="Найти мысль" width={320} />
      </div>
      <ul className="board-thoughts mt-3" data-testid="board-thoughts">
        {shown.length === 0 ? <li className="px-1 py-3 text-[13px] leading-5 text-muted">{query.trim() ? "Ничего не нашлось" : "Свободных мыслей нет — все уже в деле или на досках"}</li> : null}
        {shown.map((note) => (
          <li key={note.id} className="board-thought">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] leading-5">{firstLine(note.text) || "Голосовая мысль"}</span>
              <span className="block truncate text-[12px] leading-4 text-muted">{whenRu(note.created_at, now)}</span>
            </span>
            <button type="button" className="board-thought-add desk-focus" aria-label={`На доску: ${firstLine(note.text)}`} onClick={() => onAdd(note)} data-testid="board-thought-add">
              <Plus aria-hidden size={16} />
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
