"use client";

import { useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { NoteCard } from "@/components/notes/NoteCard";
import { Button } from "@/components/ui/Button";
import { NotesListBone } from "@/components/ui/PageSkeletons";
import { humanAqtobe } from "@/lib/ai/time";
import { filterNotes, firstLine, splitNotes } from "@/lib/notes/list";
import { useCreateNote, useDeleteNote, useUpdateNote } from "@/lib/notes/mutations";
import { useNotes, type Note } from "@/lib/notes/queries";
import { useIngestStore } from "@/lib/store/ingest";
import { pluralRu } from "@/lib/tasks/status-text";
import { useMe } from "@/lib/tasks/queries";

/**
 * «Заметки» — the director's own thoughts (D-75). Nobody else ever sees this screen or
 * these rows: privacy follows the author, not the org chart. A thought lands here by
 * voice («запиши мысль…») or by typing in the line at the top; from here it can become
 * a task or an announcement in one tap, and that is the only way out of the feed.
 */
export default function NotesPage() {
  const me = useMe();
  const notes = useNotes(me.data?.userId);
  const create = useCreateNote(me.data);
  const update = useUpdateNote(me.data);
  const remove = useDeleteNote(me.data);
  const startFromNote = useIngestStore((state) => state.startFromNote);

  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [inWorkOpen, setInWorkOpen] = useState(false);

  const { active, converted } = useMemo(() => splitNotes(notes.data ?? []), [notes.data]);
  const shown = useMemo(() => filterNotes(active, query), [active, query]);

  const write = () => {
    const text = draft.trim();
    if (!text || create.isPending) return;
    setDraft("");
    create.mutate({ text });
  };

  const cardProps = (note: Note) => ({
    note,
    open: openId === note.id,
    onToggle: () => setOpenId((id) => (id === note.id ? null : note.id)),
    onChangeText: (text: string) => update.mutate({ id: note.id, text }),
    onPin: () => update.mutate({ id: note.id, pinned: !note.pinned }),
    onDelete: () => {
      setOpenId(null);
      remove.mutate({ id: note.id });
    },
    onAssign: () => startFromNote({ id: note.id, text: note.text, audio_path: note.audio_path }, "task"),
    onAnnounce: () =>
      startFromNote({ id: note.id, text: note.text, audio_path: note.audio_path }, "announcement"),
  });

  const loading = me.isLoading || notes.isLoading;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-4">
      <h1 className="text-[24px] font-bold leading-[30px]">Заметки</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        {loading
          ? " "
          : `${active.length} ${pluralRu(active.length, ["заметка", "заметки", "заметок"])} · видишь только ты`}
      </p>

      {/* a hairline, not a filled box — the same search row as «Задачи» */}
      <label className="mt-4 flex min-h-[44px] items-center gap-2 rounded-[12px] border border-border/70 px-3 transition-colors duration-[120ms] focus-within:border-accent/60">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти в заметках"
          aria-label="Поиск по заметкам"
          className="min-w-0 flex-1 bg-transparent text-[16px] leading-[22px] text-text outline-none placeholder:text-muted"
        />
        {query ? (
          <button type="button" aria-label="Очистить" onClick={() => setQuery("")} className="text-[16px] text-muted">
            ×
          </button>
        ) : null}
      </label>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Ctrl/Cmd+Enter — the keyboard way out; plain Enter keeps writing the thought
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              write();
            }
          }}
          rows={1}
          placeholder="Записать мысль…"
          aria-label="Новая заметка"
          className="min-h-[44px] w-full flex-1 resize-none rounded-[12px] border border-border/70 bg-transparent px-3 py-3 text-[16px] leading-[22px] text-text outline-none transition-colors duration-[120ms] placeholder:text-muted focus:border-accent/60"
        />
        <Button onClick={write} disabled={!draft.trim()} loading={create.isPending}>
          Записать
        </Button>
      </div>

      {loading ? (
        <NotesListBone />
      ) : shown.length === 0 ? (
        <div className="mt-6 flex flex-col items-center card px-6 py-10 text-center">
          <Mascot state="calm" size={64} />
          <p className="mt-4 text-[16px] leading-[22px]">
            {query ? "Ничего не нашёл" : "Пока пусто"}
          </p>
          {query ? null : (
            <p className="mt-1 text-[13px] leading-4 text-muted">
              Скажи маскоту «запиши мысль…» или напиши здесь
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {shown.map((note) => (
            <NoteCard key={note.id} {...cardProps(note)} />
          ))}
        </div>
      )}

      {converted.length > 0 ? (
        <section className="mt-6">
          <button
            type="button"
            aria-expanded={inWorkOpen}
            onClick={() => setInWorkOpen((open) => !open)}
            className="flex min-h-[44px] w-full items-center gap-2 text-[13px] leading-4 text-muted"
          >
            <span>В деле · {converted.length}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              style={{ transform: inWorkOpen ? "rotate(180deg)" : "none", transition: "transform 120ms" }}
            >
              <polyline points="3.5,6 8,10.5 12.5,6" />
            </svg>
          </button>
          {inWorkOpen ? (
            <div className="mt-2 flex flex-col gap-3">
              {converted.map((note) => (
                <ConvertedRow key={note.id} note={note} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

/** A note that became something: read-only, and a task still opens by tap. */
function ConvertedRow({ note }: { note: Note }) {
  const label = note.converted_task_id ? "→ задача" : "→ объявление";
  const body = (
    <>
      <span className="block truncate text-[15px] leading-5">{firstLine(note.text) || "Без текста"}</span>
      <span className="mt-0.5 block text-[12px] leading-4 text-muted">
        {label} · {humanAqtobe(new Date(note.converted_at ?? note.created_at))}
      </span>
    </>
  );

  return note.converted_task_id ? (
    <a href={`/tasks/${note.converted_task_id}`} className="block min-h-[44px] rounded-[12px] px-1 py-1.5">
      {body}
    </a>
  ) : (
    <div className="min-h-[44px] px-1 py-1.5">{body}</div>
  );
}
