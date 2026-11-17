"use client";

import { memo, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { Marked } from "@/components/notes/NoteCard";
import { NoteIcon } from "@/components/notes/icons";
import { awaitsReminder, awaitsWords, firstLine, noteTime, reminderRu, restLines, trashExpiresAt, whenRu, type NoteGroupKey } from "@/lib/notes/list";
import type { Note } from "@/lib/notes/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/**
 * The stream of «Заметки» (D-177): rows, not cards — a listbox the keyboard walks with one
 * visible ring. The selection is the page's (`?n`); the list only draws it. Rows are memoised:
 * an arrow re-renders the two rows whose choice changed, not three hundred.
 */

/** How a row is doing on its way: only on this computer yet, its voice heard right now. */
export type RowState = {
  /** Kept on this computer, the network has not taken it yet («ждёт связи»). */
  waiting: boolean;
  /** A recording kept here that has not reached the server yet. */
  voiceHere: boolean;
  /** The words of its recording are on their way. */
  hearing: boolean;
};

const QUIET: RowState = { waiting: false, voiceHere: false, hearing: false };

export type RowHandlers = {
  /** A click: plain chooses, Ctrl/⌘ adds or removes, Shift takes the run from the chosen one. */
  onPick: (id: string, event: ReactMouseEvent) => void;
  onMenu: (id: string, event: ReactMouseEvent) => void;
};

export type ListGroup = { key: string; title: string | null; notes: Note[] };

/** The desk's words for the phone's group titles. */
const GROUP_TITLE: Partial<Record<NoteGroupKey, string>> = { reminders: "Напомню" };

export function groupTitle(key: NoteGroupKey, title: string): string {
  return GROUP_TITLE[key] ?? title;
}

/** The listbox: groups with a sticky label, rows inside. `kind` decides how a row reads. */
export function NoteList({
  groups,
  kind,
  selectedId,
  picked,
  now,
  query,
  stateOf,
  handlers,
  label,
  trashActions,
  convertedLine,
}: {
  groups: ListGroup[];
  kind: "notes" | "converted" | "trash";
  selectedId: string | null;
  picked: ReadonlySet<string>;
  now: Date;
  query: string;
  stateOf: (id: string) => RowState;
  handlers: RowHandlers;
  label: string;
  trashActions?: { restore: (note: Note) => void; purge: (note: Note) => void };
  convertedLine?: (note: Note) => string;
}) {
  // the one row Tab lands on: the chosen one, else the first
  const first = groups[0]?.notes[0]?.id ?? null;
  const tabbable = selectedId && groups.some((group) => group.notes.some((note) => note.id === selectedId)) ? selectedId : first;
  return (
    <div role="listbox" aria-label={label} aria-multiselectable="true" className="nb-list" data-kind={kind}>
      {groups.map((group) => (
        <div key={group.key} role="group" aria-label={group.title ?? label} className="nb-group">
          {group.title ? (
            <div className="nb-group-title" aria-hidden>
              {group.title}
              <span className="nums">{group.notes.length}</span>
            </div>
          ) : null}
          {group.notes.map((note) => (
            <Row
              key={note.id}
              note={note}
              kind={kind}
              group={group.key as NoteGroupKey}
              selected={note.id === selectedId}
              picked={picked.has(note.id)}
              tabbable={note.id === tabbable}
              now={now}
              query={query}
              state={stateOf(note.id)}
              handlers={handlers}
              trashActions={trashActions}
              convertedLine={kind === "converted" && convertedLine ? convertedLine(note) : null}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const Row = memo(function Row({
  note,
  kind,
  group,
  selected,
  picked,
  tabbable,
  now,
  query,
  state = QUIET,
  handlers,
  trashActions,
  convertedLine,
}: {
  note: Note;
  kind: "notes" | "converted" | "trash";
  group: NoteGroupKey;
  selected: boolean;
  picked: boolean;
  tabbable: boolean;
  now: Date;
  query: string;
  state?: RowState;
  handlers: RowHandlers;
  trashActions?: { restore: (note: Note) => void; purge: (note: Note) => void };
  convertedLine: string | null;
}) {
  const head = firstLine(note.text);
  const rest = restLines(note.text).replace(/\s*\n\s*/g, " ");
  const voice = note.audio_path !== null || state.voiceHere;
  const wordless = !head && voice;
  const ringing = kind === "notes" && awaitsReminder(note);
  const rung = kind === "notes" && note.reminded_at !== null && note.remind_at !== null;
  const reminder = ringing || rung ? reminderRu(note, now) : null;
  const when =
    kind === "converted" ? whenRu(note.converted_at ?? note.created_at, now) : kind === "trash" ? whenRu(note.deleted_at ?? note.updated_at, now) : noteTime(note.created_at, group, now);

  // what a row without words says: its voice is on its way, heard right now, or not heard
  const wordlessText = state.voiceHere
    ? state.waiting
      ? "Голос сохранён — отправлю, как будет связь"
      : "Сохраняю голос…"
    : state.hearing
      ? "Распознаю… голос сохранён"
      : awaitsWords(note)
        ? "Голосовая заметка · не расслышал"
        : "Без текста";

  return (
    <div
      role="option"
      id={`nb-row-${note.id}`}
      aria-selected={selected || picked}
      tabIndex={tabbable ? 0 : -1}
      data-testid={kind === "trash" ? "note-trashed" : "desk-row"}
      data-row=""
      data-note-id={note.id}
      data-current={selected ? "" : undefined}
      data-picked={picked ? "" : undefined}
      className="nb-row"
      onMouseDown={(event) => {
        // Shift-click picks a run: no text selection under it
        if (event.shiftKey) event.preventDefault();
      }}
      onClick={(event) => handlers.onPick(note.id, event)}
      onContextMenu={(event) => handlers.onMenu(note.id, event)}
    >
      <div className="nb-row-top">
        <p className={`nb-row-head ${head ? "" : "nb-row-head-quiet"}`}>{head ? <Marked text={head} query={query} /> : wordlessText}</p>
        <span className="nb-row-when nums">
          {note.pinned && kind === "notes" ? (
            <span className="nb-row-pin" title="Закреплена">
              <NoteIcon name="pin" size={12} />
            </span>
          ) : null}
          {when}
        </span>
      </div>
      {rest ? (
        <p className="nb-row-rest">
          <Marked text={rest} query={query} />
        </p>
      ) : null}
      {kind === "converted" && convertedLine ? <p className="nb-row-rest">{convertedLine}</p> : null}
      {kind === "trash" ? (
        <p className="nb-row-rest">{trashLine(note, now)}</p>
      ) : null}
      <RowMeta voice={voice && Boolean(head)} reminder={reminder} ringing={ringing} waiting={state.waiting && !wordless} />
      {kind === "trash" && trashActions ? (
        <span className="nb-row-actions">
          <button type="button" className="nb-row-button" onClick={(event) => (event.stopPropagation(), trashActions.restore(note))} data-testid="note-restore">
            Вернуть
          </button>
          <button
            type="button"
            className="nb-row-button nb-row-button-danger"
            aria-label="Удалить навсегда"
            title="Удалить навсегда"
            onClick={(event) => (event.stopPropagation(), trashActions.purge(note))}
          >
            <NoteIcon name="trash" size={14} />
          </button>
        </span>
      ) : null}
    </div>
  );
});

function RowMeta({ voice, reminder, ringing, waiting }: { voice: boolean; reminder: string | null; ringing: boolean; waiting: boolean }) {
  if (!voice && !reminder && !waiting) return null;
  return (
    <div className="nb-row-meta">
      {voice ? (
        <span className="nb-chip nb-chip-voice">
          <NoteIcon name="wave" size={12} />
          голос
        </span>
      ) : null}
      {reminder ? (
        <span className="nb-chip nums" data-tone={ringing ? "warn" : "quiet"}>
          <NoteIcon name="bell" size={12} />
          {reminder}
        </span>
      ) : null}
      {waiting ? <span className="nb-chip" data-tone="warn">ждёт связи</span> : null}
    </div>
  );
}

/** «исчезнет через 2 дня» — how long the bin keeps it (when it went is the row's time). */
function trashLine(note: Note, now: Date): string {
  const left = Math.max(0, Math.ceil((trashExpiresAt(note).getTime() - now.getTime()) / 86_400_000));
  return left <= 1 ? "исчезнет завтра" : `исчезнет через ${left} ${pluralRu(left, ["день", "дня", "дней"])}`;
}

/** The placeholder of the stream while the first read is on its way: the rows' own boxes. */
export function ListBones({ rows = 7 }: { rows?: number }) {
  return (
    <div className="skeleton nb-bones" aria-hidden aria-busy="true">
      <span className="nb-bone nb-bone-title" />
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="nb-bone-row">
          <span className="nb-bone" style={{ width: `${62 + ((index * 17) % 30)}%` }} />
          <span className="nb-bone nb-bone-thin" style={{ width: `${40 + ((index * 23) % 40)}%` }} />
        </span>
      ))}
    </div>
  );
}

/** A key in the stream's words: «Enter сохранить». */
export function KeyWord({ k, children }: { k: string; children: ReactNode }) {
  return (
    <span className="nb-keyword">
      <Kbd>{k}</Kbd>
      {children}
    </span>
  );
}
