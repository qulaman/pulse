"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { CardShell } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import {
  awaitsReminder,
  awaitsWords,
  firstLine,
  markMatches,
  noteTime,
  reminderRu,
  restLines,
  trashExpiresAt,
  whenRu,
  type NoteGroupKey,
} from "@/lib/notes/list";
import { useNoteSaveState } from "@/lib/notes/mutations";
import type { Note } from "@/lib/notes/queries";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, SHORT_STATUS } from "@/lib/tasks/status-text";
import { holdUpdate } from "@/lib/update/client";

import { NoteIcon } from "./icons";
import css from "./notes.module.css";

const SAVE_DEBOUNCE_MS = 600;

/** The words with every search hit under the accent. */
export function Marked({ text, query }: { text: string; query: string }) {
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

/** A small status dot: breathing while something is on its way, still once it has landed. */
export function Dot({ tone, pulse = false }: { tone: "ok" | "warn" | "accent"; pulse?: boolean }) {
  const color = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--accent)";
  return (
    <span
      aria-hidden
      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
      style={{ background: color, boxShadow: `0 0 8px ${color}`, animation: pulse ? "shimmer 1s ease-in-out infinite" : undefined }}
    />
  );
}

/**
 * The textarea of an open note: as tall as the thought, saved on a pause and on blur,
 * never by a «Сохранить» button (D-75 §6). It tells the card while a pause is pending,
 * so the receipt says «Сохраняю» from the first keystroke, not 600 ms later.
 */
export function NoteEditor({
  text,
  onChangeText,
  onDirty,
  label = "Текст заметки",
}: {
  text: string;
  onChangeText: (text: string) => void;
  onDirty: (dirty: boolean) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState(text);
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // words typed but not saved yet live only in this page: an app update waits for the save
  // (D-115); the saved text itself is safe, hence `data-update-safe` on the field
  const hold = useRef<(() => void) | null>(null);

  // autogrow: the field is as tall as the thought, never a scrollbar inside a card
  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [draft]);

  const save = (next: string) => {
    hold.current?.();
    hold.current = null;
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
    hold.current ??= holdUpdate();
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
      aria-label={label}
      placeholder="Что было сказано…"
      data-testid="note-editor"
      data-update-safe
      className="w-full resize-none rounded-[14px] bg-surface-2/60 px-3 py-2.5 text-[16px] leading-[22px] text-text outline-none placeholder:text-muted focus:bg-surface-2"
      rows={1}
    />
  );
}

/** The receipt of the autosave, in the same dot language as the status screen. */
export function SaveReceipt({ id, dirty, saved }: { id: string; dirty: boolean; saved: boolean }) {
  const state = useNoteSaveState(id);
  if (state === "offline") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] leading-4" style={{ color: "var(--warn)" }}>
        <Dot tone="warn" />
        Сохраню, как появится связь
      </span>
    );
  }
  if (dirty || state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-muted">
        <Dot tone="accent" pulse />
        Сохраняю
      </span>
    );
  }
  if (!saved) return null;
  return (
    <span data-testid="note-saved" className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-muted">
      <Dot tone="ok" />
      Сохранено
    </span>
  );
}

/** What STT heard, when the text has been edited away from it (D-75 §1, transcript-first). */
export function Original({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex min-h-[36px] items-center gap-1.5 text-[13px] leading-4 text-muted">
        Как было сказано
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms" }}>
          <polyline points="3.5,6 8,10.5 12.5,6" />
        </svg>
      </button>
      {open ? <p className="mt-1 whitespace-pre-line border-l-2 border-border pl-3 text-[14px] italic leading-5 text-muted">{raw}</p> : null}
    </div>
  );
}

/** The mark at the head of a note: pinned, spoken or written — read before any word. */
function NoteGlyph({ note, waiting }: { note: Note; waiting: boolean }) {
  const name = note.pinned ? "pin" : waiting || note.audio_path ? "wave" : "note";
  const color = note.pinned ? "var(--accent)" : waiting ? "var(--warn)" : "var(--text-muted)";
  return (
    <span
      aria-hidden
      className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      <NoteIcon name={name} size={13} />
    </span>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden className="mt-1 shrink-0 text-muted/70 transition-transform duration-[200ms] ease-out" style={{ transform: open ? "rotate(-90deg)" : "rotate(90deg)" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5.5 15.5 12 9 18.5" />
      </svg>
    </span>
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
  /** Something of this note waits on the phone for the network (D-95). */
  offline: boolean;
  onToggle: () => void;
  /** Autosave: called on a pause in typing and on blur. */
  onChangeText: (text: string) => void;
  onPin: () => void;
  onDelete: () => void;
  onAssign: () => void;
  onAnnounce: () => void;
  onRetranscribe: () => void;
  /** «Напомнить»: the page opens the time sheet for this note. */
  onRemind: () => void;
};

/**
 * One thought, as a card of «Задачи» is one task (D-93): closed — the mark (pinned, spoken,
 * written), the first line, up to two more, the time or the reminder; open, in place — the
 * text that saves itself, the recording, «Напомнить» (D-95), «Поручить / Объявить /
 * Закрепить», and copy, share, delete.
 */
export function NoteCard(props: CardProps) {
  const { note, group, now, query, open, busy, offline, onToggle, onChangeText, onPin, onDelete, onAssign, onAnnounce, onRetranscribe, onRemind } = props;
  const waiting = awaitsWords(note);
  const head = firstLine(note.text);
  const rest = restLines(note.text);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");
  const empty = !note.text.trim();
  const raw = note.raw_transcript?.trim() ?? "";
  const edited = raw !== "" && raw !== note.text.trim();
  const ringing = awaitsReminder(note);
  const reminder = reminderRu(note, now);

  // pinning moves an open card to the top of the feed: the eye follows it there
  const pinned = note.pinned;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (open) document.querySelector<HTMLElement>(`[data-task-id="${note.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [pinned, open, note.id]);

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

  const heading = waiting ? (
    busy ? (
      <span className="block" data-testid="note-transcribing">
        <span className="flex items-center gap-2 font-display text-[16px] font-semibold leading-[21px] text-muted">
          <Dot tone="accent" pulse />
          Распознаю…
        </span>
        {open ? null : (
          <>
            <Bone h={13} w="84%" className="mt-2" />
            <Bone h={13} w="56%" className="mt-1.5" />
          </>
        )}
      </span>
    ) : (
      <span className="block">
        <span className="block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em]">Голосовая заметка</span>
        <span className="mt-0.5 block text-[13px] leading-[18px]" style={{ color: "var(--warn)" }}>
          Не расслышал — голос сохранён
        </span>
      </span>
    )
  ) : (
    <>
      <span className={`${open ? "" : "line-clamp-2"} block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em]`}>
        <Marked text={head || "Без текста"} query={query} />
      </span>
      {rest && !open ? (
        <span className="mt-1 line-clamp-2 block whitespace-pre-line text-[14px] leading-[19px] text-muted">
          <Marked text={rest} query={query} />
        </span>
      ) : null}
    </>
  );

  return (
    <CardShell
      id={note.id}
      open={open}
      onToggle={onToggle}
      testId="note-card"
      headData={{ "data-note-id": note.id }}
      head={
        <>
          <NoteGlyph note={note} waiting={waiting} />
          <span className="min-w-0 flex-1">
            {heading}
            <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-4 text-muted">
              {ringing && reminder ? (
                <span className="nums inline-flex items-center gap-1 font-semibold text-accent" data-testid="note-reminder">
                  <NoteIcon name="bell" size={12} />
                  {reminder}
                </span>
              ) : (
                <span className="nums">{noteTime(note.created_at, group, now)}</span>
              )}
              {note.audio_path ? (
                <>
                  <span aria-hidden className="opacity-40">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <NoteIcon name="wave" size={12} />
                    голос
                  </span>
                </>
              ) : null}
              {note.pinned ? (
                <>
                  <span aria-hidden className="opacity-40">
                    ·
                  </span>
                  <span className="text-accent">закреплена</span>
                </>
              ) : null}
              {offline ? (
                <>
                  <span aria-hidden className="opacity-40">
                    ·
                  </span>
                  <span style={{ color: "var(--warn)" }}>ждёт связи</span>
                </>
              ) : null}
            </span>
          </span>
          <Chevron open={open} />
        </>
      }
    >
      <div className="flex min-h-[20px] items-center justify-between gap-2 text-[12px] leading-4 text-muted">
        <span className="nums">
          {humanAqtobe(new Date(note.created_at))}
          {note.audio_path ? " · голосом" : ""}
        </span>
        <SaveReceipt id={note.id} dirty={dirty} saved={saved} />
      </div>

      <div className="mt-2">
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
      </div>

      {empty && note.audio_path ? (
        <div className="mt-2 flex items-center gap-2 text-[13px] leading-4" style={{ color: busy ? "var(--text-muted)" : "var(--warn)" }}>
          {busy ? <Dot tone="accent" pulse /> : null}
          {busy ? "Распознаю…" : "Не расслышал — впишите сами или распознайте ещё раз"}
          {busy ? null : (
            <Button variant="secondary" size="sm" className="ml-auto" icon={<NoteIcon name="retry" size={14} />} data-testid="note-retranscribe" onClick={onRetranscribe}>
              Распознать
            </Button>
          )}
        </div>
      ) : null}

      {note.audio_path ? <AudioOriginal path={note.audio_path} /> : null}
      {edited ? <Original raw={raw} /> : null}

      {/* a time on the thought (D-95): set, moved or dropped in the sheet */}
      <button
        type="button"
        onClick={onRemind}
        data-testid="note-remind"
        className={`mt-3 inline-flex min-h-[40px] max-w-full items-center gap-2 rounded-full border px-3.5 text-[14px] font-semibold transition-[transform,background-color] duration-[120ms] active:scale-[0.98] ${
          ringing ? "border-accent/50 bg-accent/10 text-accent" : "border-border/80 bg-surface-2/40 text-text/85"
        }`}
      >
        <NoteIcon name="bell" size={16} />
        <span className="nums truncate">{ringing && reminder ? reminder : note.reminded_at && reminder ? `${reminder} · ещё раз` : "Напомнить"}</span>
      </button>

      {/* what the thought can become — the same three-button row as a task's card */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button className="!px-2 whitespace-nowrap !text-[14px]" icon={<NoteIcon name="task" size={16} />} disabled={empty} data-testid="note-assign" onClick={onAssign}>
          Поручить
        </Button>
        <Button variant="secondary" className="!px-2 whitespace-nowrap !text-[14px]" icon={<NoteIcon name="megaphone" size={16} />} disabled={empty} data-testid="note-announce" onClick={onAnnounce}>
          Объявить
        </Button>
        <Button
          variant="secondary"
          className={`!px-2 whitespace-nowrap !text-[14px] ${note.pinned ? "!border-accent/60 !text-accent" : ""}`}
          icon={<NoteIcon name="pin" size={16} />}
          aria-pressed={note.pinned}
          data-testid="note-pin"
          onClick={onPin}
        >
          {note.pinned ? "Открепить" : "Закрепить"}
        </Button>
      </div>

      <div className="-mx-1.5 mt-2 flex items-center">
        <IconButton label="Скопировать текст" icon="copy" disabled={empty} onClick={() => void copy()} />
        {canShare ? <IconButton label="Поделиться" icon="share" disabled={empty} onClick={() => void share()} /> : null}
        <IconButton label="Удалить заметку" icon="trash" danger testId="note-delete" onClick={onDelete} />
        <button type="button" onClick={onToggle} className="ml-auto min-h-[40px] rounded-[10px] px-2 text-[14px] font-semibold text-muted transition-colors duration-[120ms] active:bg-white/[0.05]">
          Свернуть
        </button>
      </div>
    </CardShell>
  );
}

export function IconButton({ label, icon, onClick, disabled, danger, testId }: { label: string; icon: "copy" | "share" | "trash"; onClick: () => void; disabled?: boolean; danger?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-[120ms] active:bg-white/[0.06] disabled:opacity-40"
      style={{ color: danger ? "color-mix(in srgb, var(--danger) 80%, transparent)" : "var(--text-muted)" }}
    >
      <NoteIcon name={icon} size={18} />
    </button>
  );
}

function firstName(full: string | null | undefined): string {
  return full?.trim().split(/\s+/)[0] ?? "";
}

/** A note that became something (D-81 §6): what it became, and how that is doing — a card like a task's, a tap to it. */
export function ConvertedCard({ note, task, now, query }: { note: Note; task: TaskWithPeople | undefined; now: Date; query: string }) {
  const label = note.converted_task_id
    ? ["Задача", firstName(task?.assignee?.full_name), task ? (isOverdue(task, now) ? "просрочена" : SHORT_STATUS[task.status]) : ""].filter(Boolean).join(" · ")
    : "Объявление";

  const body = (
    <>
      {note.converted_task_id && task ? (
        <span className="mt-[1px]">
          <StatusGlyph status={task.status} overdue={isOverdue(task, now)} />
        </span>
      ) : (
        <span aria-hidden className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
          <NoteIcon name={note.converted_task_id ? "task" : "megaphone"} size={13} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em]">
          <Marked text={firstLine(note.text) || "Без текста"} query={query} />
        </span>
        <span className="mt-1.5 flex items-center gap-1.5 text-[12px] leading-4 text-muted">
          <span className="min-w-0 truncate">{label}</span>
          <span className="nums ml-auto shrink-0">{whenRu(note.converted_at ?? note.created_at, now)}</span>
        </span>
      </span>
      {note.converted_task_id ? (
        <span aria-hidden className="mt-1 shrink-0 text-muted/70">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5.5 15.5 12 9 18.5" />
          </svg>
        </span>
      ) : null}
    </>
  );

  return note.converted_task_id ? (
    <Link
      href={`/tasks/${note.converted_task_id}`}
      className="task-card flex items-start gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5 transition-transform duration-[120ms] active:scale-[0.99]"
      data-testid="note-converted"
    >
      {body}
    </Link>
  ) : (
    <div className="task-card flex items-start gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5" data-testid="note-converted">
      {body}
    </div>
  );
}

/** A deleted note in the bin: the way back, and the way out for good. A point says which board it goes back to (D-102). */
export function TrashCard({
  note,
  now,
  query,
  board,
  onRestore,
  onPurge,
}: {
  note: Note;
  now: Date;
  query: string;
  /** The title of the board this point was deleted from. */
  board?: string;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <div className="task-card flex items-start gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5" data-closed data-testid="note-trashed">
      <span aria-hidden className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
        <NoteIcon name="trash" size={13} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em] text-text/70">
          <Marked text={firstLine(note.text) || (note.audio_path ? "Голосовая заметка" : "Без текста")} query={query} />
        </span>
        <span className="mt-1 block text-[12px] leading-4 text-muted">
          Удалена {whenRu(note.deleted_at ?? note.updated_at, now)}
          {note.audio_path ? " · с голосом" : ""}
        </span>
        {board ? (
          <span className="mt-0.5 block truncate text-[12px] leading-4 text-muted" data-testid="note-trashed-board">
            из доски «{board}»
          </span>
        ) : null}
        <span className="nums mt-0.5 block text-[12px] leading-4" style={{ color: "var(--warn)" }} data-testid="note-expires">
          исчезнет {humanAqtobe(trashExpiresAt(note), now)}
        </span>
        <span className="mt-3 flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<NoteIcon name="restore" size={14} />} data-testid="note-restore" onClick={onRestore}>
            Вернуть
          </Button>
          <Button variant="ghost" size="sm" className="!text-danger/80" onClick={onPurge}>
            Удалить навсегда
          </Button>
        </span>
      </span>
    </div>
  );
}

/**
 * A thought that is still only on the phone (D-95): dictated or typed without network,
 * or its tab was closed before it landed. It goes out by itself when the network is back;
 * «Удалить» is the only way to give it up, and asks twice — a recording is not undone.
 */
export function PendingCard({ note, voiced, now, onDiscard }: { note: Note; voiced: boolean; now: Date; onDiscard: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3_000);
    return () => clearTimeout(timer);
  }, [armed]);

  const head = firstLine(note.text);
  const rest = restLines(note.text);

  return (
    <div className="task-card flex items-start gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5" data-testid="note-pending" data-note-id={note.id}>
      <span
        aria-hidden
        className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)", color: "var(--warn)" }}
      >
        <NoteIcon name={voiced ? "wave" : "cloud"} size={13} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em]">
          {head || (voiced ? "Голосовая заметка" : "Без текста")}
        </span>
        {rest ? <span className="mt-1 line-clamp-2 block whitespace-pre-line text-[14px] leading-[19px] text-muted">{rest}</span> : null}
        <span className="mt-1.5 flex items-center gap-1.5 text-[12px] leading-4">
          <Dot tone="warn" pulse />
          <span style={{ color: "var(--warn)" }}>{voiced ? "Голос на телефоне — отправлю, как появится связь" : "Ждёт связи — отправлю сам"}</span>
        </span>
        <span className="mt-1 flex items-center justify-between gap-2 text-[12px] leading-4 text-muted">
          <span className="nums">{whenRu(note.created_at, now)}</span>
          <button
            type="button"
            data-testid="note-pending-discard"
            onClick={() => {
              if (!armed) {
                setArmed(true);
                return;
              }
              setArmed(false);
              onDiscard();
            }}
            className="min-h-[36px] rounded-[10px] px-2 text-[13px] font-semibold transition-colors duration-[120ms] active:bg-white/[0.05]"
            style={{ color: armed ? "var(--danger)" : "var(--text-muted)" }}
          >
            {armed ? "Ещё раз — удалю" : "Удалить"}
          </button>
        </span>
      </span>
    </div>
  );
}
