"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Toolbar } from "@/components/desk/ui/Toolbar";
import { BoardPicker } from "@/components/mindboard/BoardPicker";
import { AssignSheet } from "@/components/notes/AssignSheet";
import { ConvertedCard, NoteEditor, Original, SaveReceipt, TrashCard } from "@/components/notes/NoteCard";
import { NoteIcon } from "@/components/notes/icons";
import { RemindSheet } from "@/components/notes/RemindSheet";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { defaultTitle } from "@/lib/mindboard/list";
import { useCreateBoard, useMovePoint } from "@/lib/mindboard/mutations";
import { nextPlaceIn } from "@/lib/mindboard/tree";
import { awaitsReminder, awaitsWords, firstLine, isConverted, reminderRu } from "@/lib/notes/list";
import { useDeleteNote, usePurgeNotes, useRestoreNote, useUpdateNote } from "@/lib/notes/mutations";
import type { Note } from "@/lib/notes/queries";
import { useSentTasks } from "@/lib/tasks/queries";

import { useNotesDesk } from "./NotesDesk";
import { PurgeDialog, type Purge } from "./PurgeDialog";

/**
 * The right column of «Заметки» (D-153): the note chosen in the list — its text in the phone's
 * editor (saved on a pause, the receipt beside it), the recording, and what a thought can do:
 * «Поручить», «Напомнить», «На доску», «Закрепить», «Удалить» with «Отменить» in the toast. A note
 * that became a task, or lies in the bin, shows what it is instead.
 */
export function NoteDetail() {
  const { rows, selectedId, loading, newNote } = useNotesDesk();
  const note = selectedId ? (rows.find((row) => row.id === selectedId) ?? null) : null;

  if (!selectedId || (!note && !loading)) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-6 pt-16">
        <EmptyState
          title={selectedId ? "Заметки нет" : "Выберите заметку"}
          hint={selectedId ? "Возможно, она удалена" : "Слева — ваши мысли. Их видите только вы"}
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

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3 px-6 pb-10 pt-5" data-testid="desk-note">
      {note.deleted_at !== null ? <Trashed note={note} /> : isConverted(note) ? <Converted note={note} /> : note.board_id !== null ? <OnBoard note={note} /> : <Thought key={note.id} note={note} />}
    </div>
  );
}

/** A live thought: the actions over the editor, the editor, what was said. */
function Thought({ note }: { note: Note }) {
  const { me, now, focusId, focused, select, rows, liveBoards, summaries } = useNotesDesk();
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

  const empty = !note.text.trim();
  const raw = note.raw_transcript?.trim() ?? "";
  const edited = raw !== "" && raw !== note.text.trim();
  const ringing = awaitsReminder(note);
  const reminder = reminderRu(note, now);

  // «Новая заметка»: the caret goes into the fresh note's field once
  useEffect(() => {
    if (focusId !== note.id) return;
    document.querySelector<HTMLTextAreaElement>('[data-testid="desk-note"] [data-testid="note-editor"]')?.focus({ preventScroll: true });
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

  // the thought goes to the bottom of the board as a point; a new board is made first (D-140)
  const toBoard = (target: { id: string; title: string; fresh: boolean }) => {
    setBoarding(false);
    const position = target.fresh ? 1 : nextPlaceIn(rows.filter((row) => row.board_id === target.id && row.deleted_at === null), null);
    movePoint.mutate(
      { note, to: { boardId: target.id, position } },
      {
        onSuccess: () => {
          select(null);
          toast(note.remind_at && !note.reminded_at ? `На доске «${target.title}» · напоминание снято` : `На доске «${target.title}»`, {
            action: { label: "Открыть", onClick: () => router.push(`/desk/notes/b/${target.id}`) },
          });
        },
      },
    );
  };

  return (
    <>
      <Toolbar
        end={
          <Button
            size="sm"
            variant="danger"
            icon={<NoteIcon name="trash" size={15} />}
            data-testid="desk-note-delete"
            onClick={() => {
              select(null);
              remove.mutate({ id: note.id });
            }}
          >
            Удалить
          </Button>
        }
      >
        <Button size="sm" icon={<NoteIcon name="task" size={15} />} disabled={empty} onClick={() => setAssigning(true)} data-testid="desk-note-assign">
          Поручить
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<NoteIcon name="bell" size={15} />}
          className={ringing ? "!text-accent" : ""}
          onClick={() => setReminding(true)}
          data-testid="desk-note-remind"
        >
          <span className="nums">{ringing && reminder ? reminder : note.reminded_at && reminder ? `${reminder} · ещё раз` : "Напомнить"}</span>
        </Button>
        <Button size="sm" variant="secondary" icon={<NoteIcon name="board" size={15} />} disabled={empty} onClick={() => setBoarding(true)}>
          На доску
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<NoteIcon name="pin" size={15} />}
          aria-pressed={note.pinned}
          className={note.pinned ? "!text-accent" : ""}
          onClick={() => update.mutate({ id: note.id, pinned: !note.pinned })}
        >
          {note.pinned ? "Открепить" : "Закрепить"}
        </Button>
        <Button size="sm" variant="ghost" icon={<NoteIcon name="copy" size={15} />} disabled={empty} onClick={() => void copy()}>
          Скопировать
        </Button>
      </Toolbar>

      <div className="flex min-h-[20px] items-center justify-between gap-2 text-[12px] leading-4 text-muted">
        <span className="nums">
          {humanAqtobe(new Date(note.created_at))}
          {note.audio_path ? " · голосом" : ""}
          {note.pinned ? " · закреплена" : ""}
        </span>
        <SaveReceipt id={note.id} dirty={dirty} saved={saved} />
      </div>

      {/* the phone's editor, roomier: as tall as the thought, never shorter than a page's worth */}
      <div className="[&_textarea]:min-h-[340px] [&_textarea]:rounded-[12px] [&_textarea]:px-4 [&_textarea]:py-3 [&_textarea]:text-[15px] [&_textarea]:leading-[22px]">
        <NoteEditor
          key={note.id}
          text={note.text}
          onDirty={setDirty}
          placeholder="Мысль, план, список — сохраняется сама"
          onChangeText={(text) => {
            setSaved(true);
            update.mutate({ id: note.id, text });
          }}
        />
      </div>

      {awaitsWords(note) ? (
        <p className="text-[13px] leading-[18px]" style={{ color: "var(--warn)" }}>
          Не расслышал — голос сохранён, впишите текст сами
        </p>
      ) : null}
      {note.audio_path ? <AudioOriginal path={note.audio_path} /> : null}
      {edited ? <Original raw={raw} /> : null}

      <AssignSheet note={assigning ? note : null} onClose={() => setAssigning(false)} me={me} />
      <RemindSheet
        open={reminding}
        onClose={() => setReminding(false)}
        currentIso={note.remind_at}
        onPick={(iso) => {
          update.mutate({ id: note.id, remind_at: iso });
          toast(iso ? `Напомню ${humanAqtobe(new Date(iso), new Date())}` : "Напоминание снято");
        }}
      />
      <BoardPicker
        open={boarding}
        onClose={() => setBoarding(false)}
        subject={firstLine(note.text)}
        boards={liveBoards}
        summaries={summaries}
        onPick={(board) => toBoard({ id: board.id, title: board.title, fresh: false })}
        onNew={() => {
          // a move needs the network; a board made «for later» would wait with nothing on it
          if (!navigator.onLine) {
            setBoarding(false);
            toast("Нет связи — мысль осталась в «Мыслях»");
            return;
          }
          const id = crypto.randomUUID();
          const title = defaultTitle(new Date());
          createBoard.mutate({ id, title, client_request_id: crypto.randomUUID() }, { onSuccess: () => toBoard({ id, title, fresh: true }) });
        }}
      />
    </>
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
          <Link href={`/desk/tasks?id=${note.converted_task_id}`} className="text-[14px] font-semibold text-accent">
            Открыть задачу ›
          </Link>
        </div>
      ) : null}
      <p className="whitespace-pre-line text-[15px] leading-[22px] [overflow-wrap:anywhere]">{note.text}</p>
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
          <Link href={`/desk/notes/b/${board.id}`} className="text-[14px] font-semibold text-accent">
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
