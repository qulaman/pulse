"use client";

import { useEffect, useRef, useState } from "react";

import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { firstLine, restLines } from "@/lib/notes/list";
import type { Note } from "@/lib/notes/queries";

type Props = {
  note: Note;
  open: boolean;
  onToggle: () => void;
  /** Autosave: called on a pause in typing and on blur, never by a «Сохранить» button. */
  onChangeText: (text: string) => void;
  onPin: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onAnnounce: () => void;
};

const SAVE_DEBOUNCE_MS = 600;

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 3h6l-1 6 3.5 3.5H6.5L10 9z" />
      <line x1="12" y1="12.5" x2="12" y2="21" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
    </svg>
  );
}

/** A quiet marker on the card: the recording, the pin — never a button that acts. */
function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[12px] leading-4 text-muted">
      {children}
    </span>
  );
}

/**
 * One thought. Closed it is a heading and two lines; opened it is a textarea that
 * saves itself and four actions — hand it out, announce it, pin it, drop it (D-75).
 */
function NoteEditor({ text, onChangeText }: { text: string; onChangeText: (text: string) => void }) {
  const [draft, setDraft] = useState(text);
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // autogrow: the field is as tall as the thought, never a scrollbar inside a card
  useEffect(() => {
    const node = area.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const schedule = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (next.trim() && next !== text) onChangeText(next);
    }, SAVE_DEBOUNCE_MS);
  };

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (draft.trim() && draft !== text) onChangeText(draft);
  };

  return (
    <textarea
      ref={area}
      value={draft}
      onChange={(event) => schedule(event.target.value)}
      onBlur={flush}
      aria-label="Текст заметки"
      className="w-full resize-none bg-transparent text-[16px] leading-[22px] text-text outline-none"
      rows={1}
    />
  );
}

export function NoteCard({ note, open, onToggle, onChangeText, onPin, onDelete, onAssign, onAnnounce }: Props) {
  const [audioOpen, setAudioOpen] = useState(false);

  const head = firstLine(note.text) || "Без текста";
  const rest = restLines(note.text);

  return (
    <article className="card p-3" aria-label={head}>
      {open ? (
        // remounted per note: the editor is born with the text it edits, no effect needed
        <NoteEditor key={note.id} text={note.text} onChangeText={onChangeText} />
      ) : (
        <button type="button" onClick={onToggle} className="block w-full text-left">
          <span className="block truncate text-[16px] leading-[22px]">{head}</span>
          {rest ? <span className="mt-0.5 block line-clamp-2 text-[13px] leading-[18px] text-muted">{rest}</span> : null}
        </button>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[12px] leading-4 text-muted">{humanAqtobe(new Date(note.created_at))}</span>
        {note.audio_path ? (
          <button type="button" onClick={() => setAudioOpen((value) => !value)} aria-label="Оригинал голосом">
            <Mark>
              <MicIcon />
              голос
            </Mark>
          </button>
        ) : null}
        {note.pinned ? (
          <Mark>
            <PinIcon filled />
            закреплено
          </Mark>
        ) : null}
        <button type="button" onClick={onToggle} className="ml-auto min-h-[44px] px-1 text-[13px] leading-4 text-muted">
          {open ? "Свернуть" : "Открыть"}
        </button>
      </div>

      {audioOpen && note.audio_path ? <AudioOriginal path={note.audio_path} /> : null}

      {open ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onAssign}>
            Поручить
          </Button>
          <Button variant="secondary" onClick={onAnnounce}>
            Объявить
          </Button>
          <Button variant="ghost" onClick={onPin}>
            {note.pinned ? "Открепить" : "Закрепить"}
          </Button>
          <Button variant="ghost" className="!text-danger/80" onClick={onDelete}>
            Удалить
          </Button>
        </div>
      ) : null}
    </article>
  );
}
