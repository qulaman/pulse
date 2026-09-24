"use client";

import { onlineManager, useIsMutating } from "@tanstack/react-query";
import { Reorder, useDragControls } from "framer-motion";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { BoardOnWall } from "@/components/mindboard/BoardOnWall";
import { PointCard } from "@/components/mindboard/PointCard";
import { AssignSheet } from "@/components/notes/AssignSheet";
import { NoteIcon } from "@/components/notes/icons";
import { NotesRecorder, type RecorderWords } from "@/components/notes/NotesRecorder";
import { Mascot } from "@/components/brand/Mascot";
import { useAccordion, useMinute, useRevealOpen } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { PageHead } from "@/components/ui/PageHead";
import { BoardSkeleton } from "@/components/ui/PageSkeletons";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { boardOnWall, boardSummary, cleanTitle, nextPosition, positionBetween } from "@/lib/mindboard/list";
import { useDeleteBoard, useRenameBoard, useRestoreBoard } from "@/lib/mindboard/mutations";
import { useBoards, type MindBoard } from "@/lib/mindboard/queries";
import { useDictation, type Receipt } from "@/lib/notes/dictation";
import { firstLine, phoneRow } from "@/lib/notes/list";
import { useCreateNote, useDeleteNote, useUpdateNote } from "@/lib/notes/mutations";
import { useNotes, type Note } from "@/lib/notes/queries";
import { usePendingNotes, useReplayHearing } from "@/lib/notes/replay";
import { useMe, useSentTasks } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { useTvState } from "@/lib/tv/queries";

/** A receipt stays on the screen long enough to be read over the shoulder of a point. */
const RECEIPT_MS = 4_000;
/** An edit younger than this is simply on its way; older, with the network up, it is stuck. */
const STUCK_MS = 20_000;

const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

const TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" });

const WORDS: RecorderWords = {
  placeholder: "Написать пункт…",
  field: "Новый пункт",
  record: "Диктовать пункт",
  write: "Записать пункт",
};

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * A board of «Заметки» (D-102): points for a meeting, said one press at a time and shown on
 * the office wall with one tap. The head is the way back, the title (a tap renames it) and
 * «на стену»; the status screen is the dictaphone — every press is the next point, word for
 * word, no parser; below — the points in the order of the board, a card each, opened in
 * place, moved by the handle. A point is a note underneath: it waits on the phone without
 * network and lands once (D-95), its voice is kept before any AI (принцип 5).
 */
export default function BoardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const notes = useNotes(me.data?.userId);
  const boards = useBoards(me.data?.userId);
  const pending = usePendingNotes(me.data?.userId);
  const hearing = useReplayHearing();
  const tv = useTvState();
  const create = useCreateNote(me.data);
  const update = useUpdateNote(me.data);
  const remove = useDeleteNote(me.data);
  const rename = useRenameBoard(me.data);
  const deleteBoard = useDeleteBoard(me.data);
  const restoreBoard = useRestoreBoard(me.data);
  const writing = useIsMutating({ mutationKey: ["notes"] }) > 0;
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  const now = useMinute();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [held, setHeld] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState(false);
  // «Поручить»: the people sheet over the board, the task leaves from here (D-108)
  const [assigning, setAssigning] = useState<Note | null>(null);

  const receiptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((next: Receipt) => {
    if (receiptTimer.current) clearTimeout(receiptTimer.current);
    // a board says «пункт», not «сохранено слово в слово»: the words are the point
    setReceipt(next.eyebrow === "Записал" ? { ...next, line: "Новый пункт на доске" } : next);
    receiptTimer.current = setTimeout(() => setReceipt(null), RECEIPT_MS);
  }, []);
  useEffect(
    () => () => {
      if (receiptTimer.current) clearTimeout(receiptTimer.current);
    },
    [],
  );

  // the board from the server, or — made without network — from the phone
  const board: MindBoard | null = useMemo(() => {
    const found = boards.data?.find((row) => row.id === id);
    if (found) return found;
    const kept = pending.boards.find((entry) => entry.id === id);
    if (!kept) return null;
    return {
      id: kept.id,
      company_id: kept.companyId,
      user_id: kept.userId,
      title: kept.title,
      deleted_at: null,
      client_request_id: kept.crid,
      created_at: kept.createdAt,
      updated_at: kept.createdAt,
    };
  }, [boards.data, pending.boards, id]);

  // the points as the director should see them: the cache, edits still on the phone laid
  // over their rows, and points that exist only on the phone so far (D-95)
  const { points, phoneOnly, waiting } = useMemo(() => {
    const byId = new Map<string, Note>();
    for (const note of notes.data ?? []) if (note.board_id === id && note.deleted_at === null) byId.set(note.id, note);
    for (const edit of pending.edits) {
      const row = byId.get(edit.id);
      if (row) byId.set(edit.id, { ...row, ...edit.fields });
    }
    const phone = new Set<string>();
    for (const entry of pending.creates) {
      if (entry.boardId !== id || byId.has(entry.id)) continue;
      phone.add(entry.id);
      byId.set(entry.id, phoneRow(entry));
    }
    const late = (at: number) => !online || now.getTime() - at > STUCK_MS;
    const list = [...byId.values()].filter((note) => note.deleted_at === null);
    list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.created_at.localeCompare(b.created_at));
    return {
      points: list,
      phoneOnly: phone,
      waiting: new Set([
        ...pending.creates.filter((entry) => entry.boardId === id && late(Date.parse(entry.createdAt))).map((entry) => entry.id),
        ...pending.edits.filter((edit) => late(edit.at)).map((edit) => edit.id),
      ]),
    };
  }, [notes.data, pending, id, online, now]);

  // a new point goes under the last one — also when two are said before the first lands
  const lastPlace = useRef(0);
  const nextPlace = () => {
    const place = Math.max(nextPosition(points), lastPlace.current + 1);
    lastPlace.current = place;
    return place;
  };
  const dictation = useDictation(me.data, flash, { boardId: id, nextPosition: nextPlace });

  // the order on screen: the board's, or the one under the finger until the cache agrees
  const natural = points.map((point) => point.id);
  if (held && !dragging && (!sameSet(held, natural) || held.join() === natural.join())) setHeld(null);
  const order = held && sameSet(held, natural) ? held : natural;
  const byId = new Map(points.map((point) => [point.id, point]));

  const accordion = useAccordion(natural, { scope: id, autoOpen: false });
  useRevealOpen(accordion.openId, accordion.userTouched);

  // what a handed-over point became: only when the board holds one
  const handed = points.some((point) => point.converted_task_id !== null);
  const sent = useSentTasks(handed ? me.data?.userId : undefined);
  const taskById = useMemo(() => new Map((sent.data ?? []).map((task) => [task.id, task])), [sent.data]);

  if (me.isLoading || notes.isLoading || boards.isLoading || !me.data) return <BoardSkeleton />;

  if (!board || board.deleted_at) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-4 pb-28 pt-16 text-center" data-testid="board-missing">
        <Mascot state="calm" size={64} />
        <p className="mt-4 font-display text-[17px] font-semibold">Доски нет</p>
        <p className="mt-1 max-w-[280px] text-[14px] leading-[19px] text-muted">
          {board?.deleted_at ? "Она в корзине — вернуть можно там" : "Возможно, она удалена"}
        </p>
        <Link href="/notes?tab=boards" className="mt-5 text-[15px] font-semibold text-accent">
          К доскам
        </Link>
      </main>
    );
  }

  const summary = boardSummary(points);
  const onWall = boardOnWall(tv.data, board.id, now);
  const until = onWall && tv.data?.board_until ? TIME.format(new Date(tv.data.board_until)) : null;

  const write = (text: string) => {
    create.mutate({ id: crypto.randomUUID(), text, client_request_id: crypto.randomUUID(), board_id: board.id, position: nextPlace() });
    flash({ tone: "ok", eyebrow: "Записал", headline: firstLine(text), line: "" });
  };

  const drop = (movedId: string) => {
    setDragging(false);
    const current = held ?? natural;
    const at = current.indexOf(movedId);
    const moved = byId.get(movedId);
    if (at < 0 || !moved) return;
    const before = at > 0 ? (byId.get(current[at - 1])?.position ?? null) : null;
    const after = at < current.length - 1 ? (byId.get(current[at + 1])?.position ?? null) : null;
    const place = positionBetween(before, after);
    if (place !== moved.position && current.join() !== natural.join()) update.mutate({ id: movedId, position: place });
  };

  const idleBody =
    summary.total === 0 ? (
      <div className="flex h-full flex-col justify-center">
        <p className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.015em]">Пока пусто</p>
        <p className="mt-0.5 text-[13px] leading-[18px] text-muted">Зажмите микрофон и скажите первый пункт. Одно нажатие — один пункт</p>
      </div>
    ) : (
      <div className="flex h-full items-center gap-3.5">
        <span data-testid="board-headline" className="nums shrink-0 text-[48px] font-bold leading-[48px] tracking-[-0.04em]" style={{ color: "var(--accent)" }}>
          {summary.total}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.015em]">
            {pluralRu(summary.total, ["пункт", "пункта", "пунктов"])}
            {summary.done > 0 ? ` · ${summary.done} ${pluralRu(summary.done, ["отмечен", "отмечено", "отмечено"])}` : ""}
          </p>
          <p className="mt-0.5 truncate text-[13px] leading-[18px] text-muted">
            {summary.lastAt ? `последний ${humanAqtobe(new Date(summary.lastAt), now)}` : ""}
          </p>
          <p className="truncate text-[13px] leading-[18px] text-muted">{onWall ? "Каждый новый пункт сразу на стене" : "Кнопка сверху — доска на стену"}</p>
        </div>
      </div>
    );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28">
      <PageHead
        back={{ href: "/notes?tab=boards", label: "Заметки", testId: "board-back" }}
        smallTitle={board.title}
        heading={
          <BoardTitle
            key={board.title}
            title={board.title}
            onRename={(title) => {
              if (title !== board.title) rename.mutate({ id: board.id, title });
            }}
          />
        }
        actions={<BoardOnWall boardId={board.id} now={now} />}
      />

      <div className="mt-3">
        <NotesRecorder
          idle={{
            eyebrow: onWall ? `На стене до ${until}` : "Доска",
            right: onWall ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-accent">
                <NoteIcon name="wall" size={12} />
                видят все в кабинете
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-muted">
                <NoteIcon name="lock" size={12} />
                только вам
              </span>
            ),
            body: idleBody,
          }}
          words={WORDS}
          receipt={receipt}
          dictation={dictation}
          writing={writing}
          onWrite={write}
          onCapture={() => undefined}
        />
      </div>

      <Reorder.Group
        as="div"
        axis="y"
        values={order}
        onReorder={(next) => setHeld(next)}
        className="mt-4 flex flex-col gap-2"
        data-testid="board-points"
      >
        {order.map((pointId, index) => {
          const point = byId.get(pointId);
          if (!point) return null;
          const phone = phoneOnly.has(point.id);
          return (
            <PointRow
              key={point.id}
              id={point.id}
              movable={!phone && accordion.openId === null && order.length > 1}
              onStart={() => setDragging(true)}
              onEnd={() => drop(point.id)}
            >
              {(grip) => (
                <PointCard
                  point={point}
                  n={index + 1}
                  now={now}
                  open={accordion.openId === point.id}
                  busy={dictation.busy.has(point.id) || hearing.has(point.id)}
                  offline={waiting.has(point.id)}
                  phoneOnly={phone}
                  task={point.converted_task_id ? taskById.get(point.converted_task_id) : undefined}
                  grip={grip}
                  onToggle={() => accordion.toggle(point.id)}
                  onChangeText={(text) => update.mutate({ id: point.id, text })}
                  onDone={() => update.mutate({ id: point.id, done_at: point.done_at ? null : new Date().toISOString() })}
                  onAssign={() => setAssigning(point)}
                  onDelete={() => {
                    accordion.toggle(point.id);
                    remove.mutate({ id: point.id });
                  }}
                  onRetranscribe={() => dictation.retranscribe(point)}
                />
              )}
            </PointRow>
          );
        })}
      </Reorder.Group>

      {points.length > 1 ? (
        <p className="mt-2 px-1 text-center text-[12px] leading-4 text-muted">порядок — перетащите пункт за точки справа</p>
      ) : null}

      <div className="mt-8 flex justify-center">
        <Button variant="ghost" size="sm" className="!text-danger/80" icon={<NoteIcon name="trash" size={14} />} data-testid="board-delete" onClick={() => setConfirmDelete(true)}>
          Удалить доску
        </Button>
      </div>

      <AssignSheet note={assigning} onClose={() => setAssigning(null)} me={me.data} />

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Удалить доску">
        <p className="text-[16px] leading-[22px] text-muted">
          {summary.total > 0
            ? `Доска «${board.title}» и её ${summary.total} ${pluralRu(summary.total, ["пункт", "пункта", "пунктов"])} уйдут в корзину. Три дня их можно вернуть.`
            : `Доска «${board.title}» уйдёт в корзину. Три дня её можно вернуть.`}
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            block
            data-testid="board-delete-confirm"
            onClick={() => {
              setConfirmDelete(false);
              const boardId = board.id;
              deleteBoard.mutate({ id: boardId });
              // the screen is leaving: the way back rides in the toast, not in a callback of this page
              toast("Доска в корзине", { action: { label: "Вернуть", onClick: () => restoreBoard.mutate({ id: boardId }) } });
              router.push("/notes?tab=boards");
            }}
          >
            Удалить
          </Button>
          <Button variant="secondary" block onClick={() => setConfirmDelete(false)}>
            Не сейчас
          </Button>
        </div>
      </Sheet>
    </main>
  );
}

/**
 * The title of the board as the screen's heading: a tap turns it into a field, Enter or a tap
 * elsewhere keeps the new name, an empty field gives the old one back.
 */
function BoardTitle({ title, onRename }: { title: string; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  const done = () => {
    setEditing(false);
    const next = cleanTitle(draft, title);
    setDraft(next);
    onRename(next);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={120}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={done}
        onKeyDown={(event) => {
          if (event.key === "Enter") done();
          if (event.key === "Escape") {
            setDraft(title);
            setEditing(false);
          }
        }}
        aria-label="Название доски"
        data-testid="board-title-input"
        className="-ml-2 mt-px w-[calc(100%+16px)] rounded-[10px] bg-surface-2/60 px-2 font-display text-[34px] font-bold leading-[40px] tracking-[-0.025em] outline-none"
      />
    );
  }
  // the screen's large title (D-113): the same face, a tap renames
  return (
    <h1 className="page-head-title">
      <button
        type="button"
        onClick={() => setEditing(true)}
        data-testid="board-title"
        aria-label={`${title} — переименовать`}
        className="line-clamp-2 text-left"
      >
        {title}
      </button>
    </h1>
  );
}

/**
 * One row of the board that can be dragged by its handle only: the card itself scrolls and
 * opens as any card, the six dots move it (Framer `Reorder`, transform only).
 */
function PointRow({
  id,
  movable,
  onStart,
  onEnd,
  children,
}: {
  id: string;
  movable: boolean;
  onStart: () => void;
  onEnd: () => void;
  children: (grip: ReactNode) => ReactNode;
}) {
  const controls = useDragControls();
  const grip = movable ? (
    <button
      type="button"
      aria-label="Перетащить пункт"
      data-testid="point-grip"
      onPointerDown={(event) => {
        event.preventDefault();
        controls.start(event);
      }}
      style={{ touchAction: "none" }}
      className="flex h-9 w-7 cursor-grab items-center justify-center rounded-[8px] text-muted/70 active:cursor-grabbing active:bg-white/[0.06]"
    >
      <NoteIcon name="grip" size={16} />
    </button>
  ) : null;

  return (
    <Reorder.Item as="div" value={id} dragListener={false} dragControls={controls} onDragStart={onStart} onDragEnd={onEnd} className="relative">
      {children(grip)}
    </Reorder.Item>
  );
}
