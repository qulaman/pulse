"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { Key, Led } from "@/components/ui/device/Device";
import { Bone } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { awaitsWords, firstLine, markMatches, noteTime, restLines, type NoteGroupKey } from "@/lib/notes/list";
import { useNoteSaveState } from "@/lib/notes/mutations";
import type { Note } from "@/lib/notes/queries";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { SHORT_STATUS } from "@/lib/tasks/status-text";
import { TONE_VAR, toneOf } from "@/lib/tasks/tone";

import { NoteIcon } from "./icons";
import css from "./notes.module.css";

const SAVE_DEBOUNCE_MS = 600;

/** The words with every search hit under the accent. */
function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {markMatches(text, query).map((segment, index) =>
        segment.hit ? (
          <mark key={index} className={css.mark}>
            {segment.text}
          </mark>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}

/**
 * The textarea of an open note: as tall as the thought, saved on a pause and on blur,
 * never by a «Сохранить» button (D-75 §6). It tells the card while a pause is pending,
 * so the receipt says «Сохраняю» from the first keystroke, not 600 ms later.
 */
function NoteEditor({
  text,
  onChangeText,
  onDirty,
}: {
  text: string;
  onChangeText: (text: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(text);
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // autogrow: the field is as tall as the thought, never a scrollbar inside a card
  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [draft]);

  const save = (next: string) => {
    onDirty(false);
    if (next.trim() && next !== text) onChangeText(next);
  };

  // closing the card mid-pause still saves what was typed
  const pending = useRef<string | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current !== null) saveRef.current(pending.current);
    },
    [],
  );

  const schedule = (next: string) => {
    setDraft(next);
    pending.current = next;
    onDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = null;
      save(next);
    }, SAVE_DEBOUNCE_MS);
  };

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current !== null) {
      pending.current = null;
      save(draft);
    }
  };

  return (
    <textarea
      ref={area}
      value={draft}
      onChange={(event) => schedule(event.target.value)}
      onBlur={flush}
      aria-label="Текст заметки"
      placeholder="Что было сказано…"
      data-testid="note-editor"
      className="mt-2 w-full resize-none bg-transparent text-[16px] leading-[22px] text-text outline-none placeholder:text-muted"
      rows={1}
    />
  );
}

/** The receipt of the autosave, next to the date: the same lens language as the device. */
function SaveReceipt({ id, dirty, saved }: { id: string; dirty: boolean; saved: boolean }) {
  const state = useNoteSaveState(id);
  if (state === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] leading-4" style={{ color: "var(--warn)" }}>
        <Led tone="warn" />
        Сохраню, как появится связь
      </span>
    );
  }
  if (dirty || state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-muted">
        <Led tone="accent" blink />
        Сохраняю
      </span>
    );
  }
  if (!saved) return null;
  return (
    <span data-testid="note-saved" className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-muted">
      <Led tone="ok" />
      Сохранено
    </span>
  );
}

/** What STT heard, when the text has been edited away from it (D-75 §1, transcript-first). */
function Original({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-[36px] items-center gap-1.5 text-[13px] leading-4 text-muted"
      >
        Как было сказано
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
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms" }}
        >
          <polyline points="3.5,6 8,10.5 12.5,6" />
        </svg>
      </button>
      {open ? (
        <p className="mt-1 whitespace-pre-line border-l-2 border-border pl-3 text-[14px] italic leading-5 text-muted">{raw}</p>
      ) : null}
    </div>
  );
}

type CardProps = {
  note: Note;
  group: NoteGroupKey;
  now: Date;
  query: string;
  open: boolean;
  /** The words of this note are on their way from STT right now. */
  busy: boolean;
  onToggle: () => void;
  /** Autosave: called on a pause in typing and on blur. */
  onChangeText: (text: string) => void;
  onPin: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onAnnounce: () => void;
  onRetranscribe: () => void;
};

/**
 * One thought. Closed, it is a heading, up to three lines and the time; a dictated one
 * whose words are still on their way says «Распознаю». Opened, it is a textarea that
 * saves itself, the recording, and three keys — hand it out, announce it, pin it — with
 * copy, share and delete as quiet icons under them (D-75, D-81).
 */
export function NoteCard(props: CardProps) {
  const { note, group, now, query, open, busy, onToggle, onRetranscribe } = props;
  const card = useRef<HTMLElement>(null);
  const waiting = awaitsWords(note);

  // pinning moves an open card to the top of the feed: the eye follows it there
  const pinned = note.pinned;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (open) card.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [pinned, open]);

  if (open) return <OpenCard {...props} cardRef={card} />;

  const head = firstLine(note.text);
  const rest = restLines(note.text);

  return (
    <article ref={card} className={`card ${css.press}`} data-testid="note-card" data-note-id={note.id}>
      <button type="button" onClick={onToggle} aria-expanded={false} className="block w-full px-3.5 pb-2 pt-3 text-left">
        {waiting ? (
          busy ? (
            <span className="block" data-testid="note-transcribing">
              <span className="flex items-center gap-2 font-display text-[15px] font-semibold leading-[22px] text-muted">
                <Led tone="accent" blink />
                Распознаю…
              </span>
              <Bone h={14} w="84%" className="mt-2" />
              <Bone h={14} w="56%" className="mt-1.5" />
            </span>
          ) : (
            <span className="block">
              <span className="block font-display text-[16px] font-semibold leading-[22px] tracking-[-0.01em]">Голосовая заметка</span>
              <span className="mt-1 block text-[14px] leading-5" style={{ color: "var(--warn)" }}>
                Не расслышал. Голос сохранён
              </span>
            </span>
          )
        ) : (
          <>
            <span className="flex items-start gap-2">
              <span className="line-clamp-2 min-w-0 flex-1 font-display text-[16px] font-semibold leading-[22px] tracking-[-0.01em]">
                <Marked text={head || "Без текста"} query={query} />
              </span>
              {note.pinned ? <NoteIcon name="pin" size={14} className="mt-1 text-accent" /> : null}
            </span>
            {rest ? (
              <span className="mt-1 line-clamp-3 block whitespace-pre-line text-[14px] leading-5 text-muted">
                <Marked text={rest} query={query} />
              </span>
            ) : null}
          </>
        )}
      </button>

      <div className="flex min-h-[32px] items-center gap-2 px-3.5 pb-2.5 text-[12px] leading-4 text-muted">
        <span className="nums">{noteTime(note.created_at, group, now)}</span>
        {note.audio_path ? (
          <span className="inline-flex items-center gap-1">
            <NoteIcon name="wave" size={13} />
            голос
          </span>
        ) : null}
        {waiting && !busy ? (
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            icon={<NoteIcon name="retry" size={14} />}
            data-testid="note-retranscribe"
            onClick={onRetranscribe}
          >
            Распознать
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function OpenCard({
  note,
  busy,
  onToggle,
  onChangeText,
  onPin,
  onDelete,
  onAssign,
  onAnnounce,
  onRetranscribe,
  cardRef,
}: CardProps & { cardRef: React.RefObject<HTMLElement | null> }) {
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");
  const empty = !note.text.trim();
  const raw = note.raw_transcript?.trim() ?? "";
  const edited = raw !== "" && raw !== note.text.trim();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note.text);
      toast("Скопировал");
    } catch {
      toast("Не получилось скопировать");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ text: note.text });
    } catch {
      // the director closed the share sheet: nothing to report
    }
  };

  return (
    <article ref={cardRef} className={`card ${css.open}`} data-testid="note-card" data-note-id={note.id} data-open>
      <div className="px-3.5 pb-2 pt-3">
        <div className="flex min-h-[20px] items-center justify-between gap-2 text-[12px] leading-4 text-muted">
          <span className="nums">
            {humanAqtobe(new Date(note.created_at))}
            {note.audio_path ? " · голосом" : ""}
          </span>
          <SaveReceipt id={note.id} dirty={dirty} saved={saved} />
        </div>

        {/* remounted per note: the editor is born with the text it edits */}
        <NoteEditor
          key={note.id}
          text={note.text}
          onDirty={setDirty}
          onChangeText={(text) => {
            setSaved(true);
            onChangeText(text);
          }}
        />

        {empty && note.audio_path ? (
          <div className="mt-1 flex items-center gap-2 text-[13px] leading-4" style={{ color: busy ? "var(--text-muted)" : "var(--warn)" }}>
            {busy ? <Led tone="accent" blink /> : null}
            {busy ? "Распознаю…" : "Не расслышал — впиши сам или распознай ещё раз"}
            {busy ? null : (
              <Button variant="secondary" size="sm" className="ml-auto" onClick={onRetranscribe}>
                Распознать
              </Button>
            )}
          </div>
        ) : null}

        {note.audio_path ? <AudioOriginal path={note.audio_path} /> : null}
        {edited ? <Original raw={raw} /> : null}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Key icon={<NoteIcon name="task" size={18} />} disabled={empty} data-testid="note-assign" onClick={onAssign}>
            Поручить
          </Key>
          <Key icon={<NoteIcon name="megaphone" size={18} />} disabled={empty} data-testid="note-announce" onClick={onAnnounce}>
            Объявить
          </Key>
          <Key on={note.pinned} icon={<NoteIcon name="pin" size={18} />} data-testid="note-pin" onClick={onPin}>
            {note.pinned ? "Закреплена" : "Закрепить"}
          </Key>
        </div>

        <div className="mt-1.5 flex items-center">
          <button
            type="button"
            aria-label="Скопировать текст"
            title="Скопировать"
            disabled={empty}
            onClick={() => void copy()}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors duration-[120ms] hover:text-text disabled:opacity-40"
          >
            <NoteIcon name="copy" size={18} />
          </button>
          {canShare ? (
            <button
              type="button"
              aria-label="Поделиться"
              title="Поделиться"
              disabled={empty}
              onClick={() => void share()}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors duration-[120ms] hover:text-text disabled:opacity-40"
            >
              <NoteIcon name="share" size={18} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Удалить заметку"
            title="Удалить"
            data-testid="note-delete"
            onClick={onDelete}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-[120ms]"
            style={{ color: "color-mix(in srgb, var(--danger) 80%, transparent)" }}
          >
            <NoteIcon name="trash" size={18} />
          </button>
          <button type="button" onClick={onToggle} className="ml-auto min-h-[44px] px-1 text-[13px] leading-4 text-muted">
            Свернуть
          </button>
        </div>
      </div>
    </article>
  );
}

function firstName(full: string | null | undefined): string {
  return full?.trim().split(/\s+/)[0] ?? "";
}

/** A note that became something: what it became, and how that is doing now. */
export function ConvertedCard({ note, task, now, query }: { note: Note; task: TaskWithPeople | undefined; now: Date; query: string }) {
  const tone = task ? toneOf(task.status, false) : "muted";
  const label = note.converted_task_id
    ? ["Задача", firstName(task?.assignee?.full_name), task ? SHORT_STATUS[task.status].toLowerCase() : ""].filter(Boolean).join(" · ")
    : "Объявление";

  const body = (
    <>
      <span className="line-clamp-2 block font-display text-[16px] font-semibold leading-[22px] tracking-[-0.01em]">
        <Marked text={firstLine(note.text) || "Без текста"} query={query} />
      </span>
      <span className="mt-2 flex items-center gap-2 text-[12px] leading-4">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE_VAR[note.converted_task_id ? tone : "accent"] }} />
        <span className="min-w-0 truncate">{label}</span>
        <span className="nums ml-auto shrink-0 text-muted">{humanAqtobe(new Date(note.converted_at ?? note.created_at), now)}</span>
      </span>
    </>
  );

  return note.converted_task_id ? (
    <Link href={`/tasks/${note.converted_task_id}`} className={`card block px-3.5 py-3 ${css.press}`} data-testid="note-converted">
      {body}
    </Link>
  ) : (
    <div className="card px-3.5 py-3" data-testid="note-converted">
      {body}
    </div>
  );
}

/** A deleted note in the bin: the way back, and the way out for good. */
export function TrashCard({
  note,
  now,
  query,
  onRestore,
  onPurge,
}: {
  note: Note;
  now: Date;
  query: string;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <div className="card px-3.5 pb-2.5 pt-3" data-testid="note-trashed">
      <p className="line-clamp-2 font-display text-[16px] font-semibold leading-[22px] tracking-[-0.01em] text-muted">
        <Marked text={firstLine(note.text) || (note.audio_path ? "Голосовая заметка" : "Без текста")} query={query} />
      </p>
      <p className="mt-1 text-[12px] leading-4 text-muted">
        Удалена {humanAqtobe(new Date(note.deleted_at ?? note.updated_at), now)}
        {note.audio_path ? " · с голосом" : ""}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        <Button variant="secondary" size="sm" icon={<NoteIcon name="restore" size={14} />} data-testid="note-restore" onClick={onRestore}>
          Вернуть
        </Button>
        <Button variant="ghost" size="sm" className="!text-danger/80" onClick={onPurge}>
          Удалить навсегда
        </Button>
      </div>
    </div>
  );
}
