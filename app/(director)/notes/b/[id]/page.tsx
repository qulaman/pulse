"use client";

import { onlineManager, useIsMutating } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { BoardOnWall } from "@/components/mindboard/BoardOnWall";
import { BoardPresenter } from "@/components/mindboard/BoardPresenter";
import { BoardScreen, type BoardActions, type BoardLines } from "@/components/mindboard/BoardScreen";
import { AssignSheet } from "@/components/notes/AssignSheet";
import { useMinute } from "@/components/tasks/list/TaskList";
import { BoardSkeleton } from "@/components/ui/PageSkeletons";
import { toast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import { boardOnWall } from "@/lib/mindboard/list";
import { useDeleteBoard, useRenameBoard, useRestoreBoard } from "@/lib/mindboard/mutations";
import { useBoards, type MindBoard } from "@/lib/mindboard/queries";
import { nextPlaceIn } from "@/lib/mindboard/tree";
import { useDictation, type Receipt } from "@/lib/notes/dictation";
import { firstLine, phoneRow } from "@/lib/notes/list";
import { useCreateNote, useDeleteNote, useUpdateNote } from "@/lib/notes/mutations";
import { useNotes, type Note } from "@/lib/notes/queries";
import { usePendingNotes, useReplayHearing } from "@/lib/notes/replay";
import { useMe, useSentTasks } from "@/lib/tasks/queries";
import { useTvBoardControl } from "@/lib/tv/mutations";
import { useTvState } from "@/lib/tv/queries";
import { boardPointOf } from "@/lib/tv/state";

/** A receipt stays on the screen long enough to be read over the shoulder of a point. */
const RECEIPT_MS = 4_000;
/** An edit younger than this is simply on its way; older, with the network up, it is stuck. */
const STUCK_MS = 20_000;

const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

const TIME = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" });

const quote = (text: string) => {
  const line = firstLine(text);
  return line.length > 28 ? `${line.slice(0, 27).trimEnd()}…` : line;
};

/**
 * A board of «Заметки» (D-102, D-121) — the data behind `BoardScreen`: the board and its
 * lines from the one notes cache with what still waits on the phone laid over them (D-95),
 * the wall row, the screen's one dictaphone, and every write as one mutation. A line is a
 * note underneath: it waits on the phone without network and lands once, its voice is kept
 * before any AI (принцип 5).
 */
export default function BoardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useMe();
  const notes = useNotes(me.data?.userId);
  const boards = useBoards(me.data?.userId);
  const pending = usePendingNotes(me.data?.userId);
  const heard = useReplayHearing();
  const tv = useTvState();
  const control = useTvBoardControl();
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
  // «Поручить»: the people sheet over the board, the task leaves from here (D-108)
  const [assigning, setAssigning] = useState<Note | null>(null);

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

  // the lines as the director should see them: the cache, edits still on the phone laid over
  // their rows, and lines that exist only on the phone so far (D-95)
  const { rows, phone, owed, late } = useMemo(() => {
    const byId = new Map<string, Note>();
    for (const note of notes.data ?? []) if (note.board_id === id && note.deleted_at === null) byId.set(note.id, note);
    for (const edit of pending.edits) {
      const row = byId.get(edit.id);
      if (row) byId.set(edit.id, { ...row, ...edit.fields });
    }
    const phoneOnly = new Set<string>();
    const creates = pending.creates.filter((entry) => entry.boardId === id);
    for (const entry of creates) {
      if (byId.has(entry.id)) continue;
      phoneOnly.add(entry.id);
      byId.set(entry.id, phoneRow(entry));
    }
    const stuck = (at: number) => !online || now.getTime() - at > STUCK_MS;
    return {
      rows: [...byId.values()].filter((note) => note.deleted_at === null),
      phone: phoneOnly,
      owed: new Set(creates.map((entry) => entry.id)),
      late: new Set([
        ...creates.filter((entry) => stuck(Date.parse(entry.createdAt))).map((entry) => entry.id),
        ...pending.edits.filter((edit) => stuck(edit.at)).map((edit) => edit.id),
      ]),
    };
  }, [notes.data, pending, id, online, now]);

  // the one microphone of the screen (D-121): whose words it takes is decided when it opens —
  // the status screen says points, «+ подпункт» of an open point says its sub-points
  const aimRef = useRef<string | null>(null);
  const [aimed, setAimed] = useState<string | null>(null);
  const aim = useCallback((parentId: string | null) => {
    aimRef.current = parentId;
    setAimed(parentId);
  }, []);
  // the parent of the capture whose words are on their way: the receipt names it
  const captured = useRef<string | null>(null);

  // a new line goes under the last one of its list — also when two are said before the first lands
  const lastPlace = useRef(new Map<string, number>());
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  });
  const nextPlace = useCallback((parentId: string | null) => {
    const key = parentId ?? "";
    const place = Math.max(nextPlaceIn(rowsRef.current, parentId), (lastPlace.current.get(key) ?? 0) + 1);
    lastPlace.current.set(key, place);
    return place;
  }, []);

  const receiptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((next: Receipt) => {
    if (receiptTimer.current) clearTimeout(receiptTimer.current);
    setReceipt(next);
    receiptTimer.current = setTimeout(() => setReceipt(null), RECEIPT_MS);
  }, []);
  // the dictaphone's receipt: a board says «пункт» / «подпункт», not «сохранено слово в слово»
  const flash = useCallback(
    (next: Receipt) => {
      if (next.eyebrow !== "Записал") return show(next);
      const parent = captured.current ? rowsRef.current.find((row) => row.id === captured.current) : undefined;
      show({ ...next, line: parent ? `Подпункт к «${quote(parent.text)}»` : "Новый пункт на доске" });
    },
    [show],
  );
  useEffect(
    () => () => {
      if (receiptTimer.current) clearTimeout(receiptTimer.current);
    },
    [],
  );

  const dictation = useDictation(me.data, flash, {
    boardId: id,
    parentId: () => {
      captured.current = aimRef.current;
      return aimRef.current;
    },
    nextPosition: () => nextPlace(aimRef.current),
  });

  // what a handed-over line became: only when the board holds one
  const handed = rows.some((row) => row.converted_task_id !== null);
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

  // the wall (D-121): the board on it, till when, and the point the presenter lit
  const onWall = boardOnWall(tv.data, board.id, now);
  const until = onWall && tv.data?.board_until ? TIME.format(new Date(tv.data.board_until)) : null;
  const spot = onWall ? boardPointOf(tv.data ?? null, now) : null;

  const lines: BoardLines = {
    rows,
    phone,
    owed,
    late,
    online,
    hearing: new Set([...dictation.busy, ...heard]),
  };

  const actions: BoardActions = {
    write: (text, parentId) => {
      create.mutate({
        id: crypto.randomUUID(),
        text,
        client_request_id: crypto.randomUUID(),
        board_id: board.id,
        position: nextPlace(parentId),
        parent_id: parentId,
      });
      haptic(10);
      if (parentId === null) show({ tone: "ok", eyebrow: "Записал", headline: firstLine(text), line: "Новый пункт на доске" });
    },
    edit: (row, fields) => update.mutate({ id: row.id, ...fields }),
    remove: (row, words) => remove.mutate({ id: row.id, at: new Date().toISOString(), words }),
    retranscribe: (row) => dictation.retranscribe(row),
    assign: setAssigning,
    spotlight: (pointId) => control.mutate(pointId ? { point: pointId } : { clearPoint: true }),
    rename: (title) => rename.mutate({ id: board.id, title }),
    deleteBoard: () => {
      const boardId = board.id;
      deleteBoard.mutate({ id: boardId });
      // the screen is leaving: the way back rides in the toast, not in a callback of this page
      toast("Доска в корзине", { action: { label: "Вернуть", onClick: () => restoreBoard.mutate({ id: boardId }) } });
      router.push("/notes?tab=boards");
    },
    aim,
  };

  return (
    <BoardScreen
      board={board}
      lines={lines}
      wall={{ onWall, until, spot, ready: tv.data !== undefined }}
      now={now}
      taskOf={(row) => (row.converted_task_id ? taskById.get(row.converted_task_id) : undefined)}
      dictation={dictation}
      aimed={aimed}
      receipt={receipt}
      writing={writing}
      actions={actions}
      wallButton={<BoardOnWall boardId={board.id} now={now} />}
      presenter={(points) => <BoardPresenter variant="board" boardId={board.id} points={points} now={now} />}
      sheets={<AssignSheet note={assigning} onClose={() => setAssigning(null)} me={me.data} />}
    />
  );
}
