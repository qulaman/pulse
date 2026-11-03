"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { MenuButton, type MenuItem } from "@/components/desk/ui/Menu";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { BoardPicker } from "@/components/mindboard/BoardPicker";
import { AssignSheet } from "@/components/notes/AssignSheet";
import { ConvertedCard, Original, SaveReceipt, TrashCard } from "@/components/notes/NoteCard";
import { NoteIcon, type NoteIconName } from "@/components/notes/icons";
import { RemindSheet } from "@/components/notes/RemindSheet";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { defaultTitle } from "@/lib/mindboard/list";
import { useCreateBoard, useMovePoint } from "@/lib/mindboard/mutations";
import { nextPlaceIn } from "@/lib/mindboard/tree";
import { awaitsReminder, awaitsWords, firstLine, isConverted, reminderRu, remindPresets } from "@/lib/notes/list";
import { useDeleteNote, usePurgeNotes, useRestoreNote, useUpdateNote } from "@/lib/notes/mutations";
import type { Note } from "@/lib/notes/queries";
import { useSentTasks } from "@/lib/tasks/queries";
import { holdUpdate } from "@/lib/update/client";

import { useNotesDesk } from "./NotesDesk";
import { PurgeDialog, type Purge } from "./PurgeDialog";

/** A pause in typing this long saves the text — the phone's own rhythm. */
const SAVE_DEBOUNCE_MS = 600;
/** Boards listed in «На доску» before «Все доски…». */
const BOARDS_SHOWN = 7;

/**
 * The right column of «Заметки» (D-153, wave 3): the note chosen in the list as a page of a
 * desktop notes app — a slim bar of actions on top (each with its key in the hint), the text as a
 * document below it, saved by itself on a pause, on leaving and on Ctrl+S with the receipt
 * «Сохранено» in the bar. A note that became a task, or lies in the bin, shows what it is instead.
 */
export function NoteDetail() {
  const { rows, selectedId, loading, newNote } = useNotesDesk();
  const note = selectedId ? (rows.find((row) => row.id === selectedId) ?? null) : null;

  if (!selectedId || (!note && !loading)) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-6 pt-16">
        <EmptyState
          title={selectedId ? "Заметки нет" : "Выберите заметку"}
          hint={
            selectedId ? (
              "Возможно, она удалена"
            ) : (
              <>
                Слева — ваши мысли, их видите только вы. <Kbd>↑</Kbd> <Kbd>↓</Kbd> — по списку, <Kbd>N</Kbd> — новая
              </>
            )
          }
          action={
            <Button size="sm" variant="secondary" onClick={newNote}>
              Новая заметка
            </Button>
          }
        />
      </div>
    );
  }
  if (!note) return <div className="mx-auto mt-5 h-[320px] w-full max-w-[760px] rounded-[12px] bg-surface-2/60 px-6" aria-hidden />;

  if (note.deleted_at === null && !isConverted(note) && note.board_id === null) return <Thought key={note.id} note={note} />;
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3 px-6 pb-10 pt-5" data-testid="desk-note">
      {note.deleted_at !== null ? <Trashed note={note} /> : isConverted(note) ? <Converted note={note} /> : <OnBoard note={note} />}
    </div>
  );
}

/** A live thought: the bar of actions, the page of text, what was said. */
function Thought({ note }: { note: Note }) {
  const { me, now, focusId, focused, select, rows, liveBoards, summaries, neighbourOf } = useNotesDesk();
  const update = useUpdateNote(me);
  const remove = useDeleteNote(me);
  const movePoint = useMovePoint(me);
  const createBoard = useCreateBoard(me);
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [boarding, setBoarding] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);

  const empty = !note.text.trim();
  const raw = note.raw_transcript?.trim() ?? "";
  const edited = raw !== "" && raw !== note.text.trim();
  const ringing = awaitsReminder(note);
  const reminder = reminderRu(note, now);

  // «Новая заметка»: the caret goes into the fresh note's page once
  useEffect(() => {
    if (focusId !== note.id) return;
    editor.current?.focus({ preventScroll: true });
    focused();
  }, [focusId, note.id, focused]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note.text);
      toast("Скопировал");
    } catch {
      toast("Не получилось скопировать");
    }
  };

  const remind = (iso: string | null) => {
    update.mutate({ id: note.id, remind_at: iso });
    toast(iso ? `Напомню ${humanAqtobe(new Date(iso), new Date())}` : "Напоминание снято");
  };

  // the thought goes to the bottom of the board as a point; a new board is made first (D-140)
  const toBoard = (target: { id: string; title: string; fresh: boolean }) => {
    setBoarding(false);
    const position = target.fresh ? 1 : nextPlaceIn(rows.filter((row) => row.board_id === target.id && row.deleted_at === null), null);
    movePoint.mutate(
      { note, to: { boardId: target.id, position } },
      {
        onSuccess: () => {
          select(neighbourOf(note.id));
          toast(note.remind_at && !note.reminded_at ? `На доске «${target.title}» · напоминание снято` : `На доске «${target.title}»`, {
            action: { label: "Открыть", onClick: () => router.push(`/desk/notes/b/${target.id}`) },
          });
        },
      },
    );
  };
  const toNewBoard = () => {
    // a move needs the network; a board made «for later» would wait with nothing on it
    if (!navigator.onLine) {
      setBoarding(false);
      toast("Нет связи — мысль осталась в «Мыслях»");
      return;
    }
    const id = crypto.randomUUID();
    const title = defaultTitle(new Date());
    createBoard.mutate({ id, title, client_request_id: crypto.randomUUID() }, { onSuccess: () => toBoard({ id, title, fresh: true }) });
  };

  const remindItems: MenuItem[] = [
    ...remindPresets(now).map((preset) => ({ key: preset.label, label: preset.label, onSelect: () => remind(preset.at.toISOString()) })),
    { key: "custom", label: "Своё время…", onSelect: () => setReminding(true) },
    ...(note.remind_at ? ["separator" as const, { key: "clear", label: "Не напоминать", onSelect: () => remind(null) }] : []),
  ];
  const boardItems: MenuItem[] = [
    ...liveBoards.slice(0, BOARDS_SHOWN).map((board) => ({ key: board.id, label: board.title, icon: <NoteIcon name="board" size={14} />, onSelect: () => toBoard({ id: board.id, title: board.title, fresh: false }) })),
    ...(liveBoards.length > BOARDS_SHOWN ? [{ key: "all", label: "Все доски…", onSelect: () => setBoarding(true) }] : []),
    ...(liveBoards.length > 0 ? ["separator" as const] : []),
    { key: "new", label: "Новая доска", icon: <NoteIcon name="plus" size={14} />, onSelect: toNewBoard },
  ];

  return (
    <div className="flex min-h-full flex-col" data-testid="desk-note">
      {/* the bar stays on top while a long note scrolls under it */}
      <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-1 border-b border-border/60 bg-bg/90 px-5 backdrop-blur-sm">
        <Tooltip label="Поручить кому-то из команды" side="bottom">
          <Button size="sm" icon={<NoteIcon name="task" size={15} />} disabled={empty} onClick={() => setAssigning(true)} data-testid="desk-note-assign">
            Поручить
          </Button>
        </Tooltip>
        <span className="mx-1 h-5 w-px bg-border/80" aria-hidden />
        <MenuButton items={remindItems} label="Напомнить" align="start" width={220} className={BAR_BUTTON}>
          <span className={`flex items-center gap-1.5 ${ringing ? "text-accent" : ""}`} data-testid="desk-note-remind">
            <NoteIcon name="bell" size={15} />
            <span className="nums">{ringing && reminder ? reminder : "Напомнить"}</span>
            <Chevron />
          </span>
        </MenuButton>
        <MenuButton items={boardItems} label="На доску" align="start" width={260} className={BAR_BUTTON}>
          <span className="flex items-center gap-1.5" data-testid="desk-note-board">
            <NoteIcon name="board" size={15} />
            На доску
            <Chevron />
          </span>
        </MenuButton>
        <BarIcon
          icon="pin"
          label={note.pinned ? "Открепить" : "Закрепить сверху"}
          keys={["P"]}
          active={note.pinned}
          onClick={() => {
            update.mutate({ id: note.id, pinned: !note.pinned });
            toast(note.pinned ? "Открепил" : "Закрепил сверху");
          }}
        />
        <BarIcon icon="copy" label="Скопировать текст" disabled={empty} onClick={() => void copy()} />
        <span className="ml-auto pr-2">
          <SaveReceipt id={note.id} dirty={dirty} saved={saved} />
        </span>
        <BarIcon
          icon="trash"
          label="В корзину"
          keys={["Del"]}
          danger
          testId="desk-note-delete"
          onClick={() => {
            select(neighbourOf(note.id));
            remove.mutate({ id: note.id });
          }}
        />
      </div>

      <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-10 pb-16 pt-6">
        <p className="nums mb-3 text-[12px] leading-4 text-muted">
          {humanAqtobe(new Date(note.created_at))}
          {note.audio_path ? " · голосом" : ""}
          {note.pinned ? " · закреплена" : ""}
          {ringing && reminder ? ` · ${reminder}` : ""}
        </p>
        <PageEditor
          key={note.id}
          ref={editor}
          text={note.text}
          onDirty={setDirty}
          onSave={(text) => {
            setSaved(true);
            update.mutate({ id: note.id, text });
          }}
        />
        {awaitsWords(note) ? (
          <p className="mt-3 text-[13px] leading-[18px]" style={{ color: "var(--warn)" }}>
            Не расслышал — голос сохранён, впишите текст сами
          </p>
        ) : null}
        {note.audio_path ? (
          <div className="mt-4 max-w-[420px]">
            <AudioOriginal path={note.audio_path} />
          </div>
        ) : null}
        {edited ? <Original raw={raw} /> : null}
      </div>

      <AssignSheet note={assigning ? note : null} onClose={() => setAssigning(false)} me={me} />
      <RemindSheet open={reminding} onClose={() => setReminding(false)} currentIso={note.remind_at} onPick={remind} />
      <BoardPicker
        open={boarding}
        onClose={() => setBoarding(false)}
        subject={firstLine(note.text)}
        boards={liveBoards}
        summaries={summaries}
        onPick={(board) => toBoard({ id: board.id, title: board.title, fresh: false })}
        onNew={toNewBoard}
      />
    </div>
  );
}

const BAR_BUTTON = "flex h-9 items-center rounded-[10px] px-2.5 font-display text-[13px] font-semibold leading-4 text-text/90 transition-colors duration-[120ms] hover:bg-surface-2";

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-muted">
      <polyline points="4,6 8,10 12,6" />
    </svg>
  );
}

function BarIcon({
  icon,
  label,
  keys,
  onClick,
  active = false,
  danger = false,
  disabled = false,
  testId,
}: {
  icon: NoteIconName;
  label: string;
  keys?: string[];
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <Tooltip label={label} keys={keys} side="bottom">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active || undefined}
        disabled={disabled}
        onClick={onClick}
        data-testid={testId}
        className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors duration-[120ms] hover:bg-surface-2 disabled:opacity-40 ${
          active ? "text-accent" : danger ? "text-muted hover:text-danger" : "text-muted hover:text-text"
        }`}
      >
        <NoteIcon name={icon} size={16} />
      </button>
    </Tooltip>
  );
}

/**
 * The text of a note as a page (wave 3): no field around it, as tall as the thought and never
 * shorter than the room under it; saved on a pause, on leaving the page (blur, another note) and
 * on Ctrl+S. Words typed and not saved yet hold an app update (D-115). An emptied note keeps its
 * last words — the bin is the way to remove it, as on the phone.
 */
function PageEditor({ text, onSave, onDirty, ref }: { text: string; onSave: (text: string) => void; onDirty: (dirty: boolean) => void; ref: RefObject<HTMLTextAreaElement | null> }) {
  const [draft, setDraft] = useState(text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const hold = useRef<(() => void) | null>(null);
  const last = useRef(text);

  // as tall as the text: the column scrolls, never the field
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [draft, ref]);

  const save = (next: string) => {
    hold.current?.();
    hold.current = null;
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    onDirty(false);
    if (next.trim() && next !== last.current) {
      last.current = next;
      onSave(next);
    }
  };
  // leaving the note mid-pause still saves what was typed
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(
    () => () => {
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
    timer.current = setTimeout(() => save(next), SAVE_DEBOUNCE_MS);
  };

  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={(event) => schedule(event.target.value)}
      onBlur={() => {
        if (pending.current !== null) save(pending.current);
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
          event.preventDefault();
          save(draft);
        }
      }}
      aria-label="Текст заметки"
      placeholder="Мысль, план, список — сохраняется сама"
      data-testid="note-editor"
      data-update-safe
      spellCheck
      rows={1}
      className="no-bar min-h-[calc(100dvh-260px)] w-full resize-none bg-transparent text-[16px] leading-[26px] text-text outline-none placeholder:text-muted/70"
    />
  );
}

/** A note that became a task or an announcement: what it became, and its words as they were. */
function Converted({ note }: { note: Note }) {
  const { me, now } = useNotesDesk();
  const sent = useSentTasks(note.converted_task_id ? me?.userId : undefined);
  const task = note.converted_task_id ? sent.data?.find((row) => row.id === note.converted_task_id) : undefined;
  return (
    <>
      <ConvertedCard note={note} task={task} now={now} query="" />
      {note.converted_task_id ? (
        <div>
          <Link href={`/desk/tasks?id=${note.converted_task_id}`} className="text-[14px] font-semibold text-accent hover:underline">
            Открыть задачу ›
          </Link>
        </div>
      ) : null}
      <p className="whitespace-pre-line text-[15px] leading-[24px] [overflow-wrap:anywhere]">{note.text}</p>
      {note.audio_path ? <AudioOriginal path={note.audio_path} /> : null}
    </>
  );
}

/** A note moved onto a board meanwhile: it lives there now. */
function OnBoard({ note }: { note: Note }) {
  const { boards } = useNotesDesk();
  const board = boards.find((row) => row.id === note.board_id);
  return (
    <EmptyState
      title={board ? `Пункт доски «${board.title}»` : "Пункт доски"}
      hint={firstLine(note.text)}
      action={
        board ? (
          <Link href={`/desk/notes/b/${board.id}`} className="text-[14px] font-semibold text-accent hover:underline">
            Открыть доску ›
          </Link>
        ) : null
      }
    />
  );
}

/** A deleted note opened by its address: the way back, and the way out for good. */
function Trashed({ note }: { note: Note }) {
  const { me, now, select } = useNotesDesk();
  const restore = useRestoreNote(me);
  const purge = usePurgeNotes(me);
  const [purging, setPurging] = useState<Purge | null>(null);
  return (
    <>
      <TrashCard
        note={note}
        now={now}
        query=""
        onRestore={() => {
          restore.mutate({ id: note.id });
          toast("Вернул в мысли");
        }}
        onPurge={() => setPurging({ notes: [note.id], boards: [] })}
      />
      <PurgeDialog
        purging={purging}
        onClose={() => setPurging(null)}
        onConfirm={(what) => {
          purge.mutate({ ids: what.notes });
          setPurging(null);
          select(null);
        }}
      />
    </>
  );
}
