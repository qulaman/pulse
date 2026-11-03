"use client";

import { onlineManager, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { DeskPresenter } from "@/components/desk/screen/DeskPresenter";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskLight } from "@/components/desk/ui/Light";
import { MenuButton, type MenuItem } from "@/components/desk/ui/Menu";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { Dialog } from "@/components/desk/ui/Dialog";
import { BoardPicker } from "@/components/mindboard/BoardPicker";
import { carryOver, ejectReceipt, openWords } from "@/components/mindboard/carry";
import { EXTEND_MINUTES, WallSheet } from "@/components/mindboard/WallSheet";
import { AssignSheet } from "@/components/notes/AssignSheet";
import { NoteIcon } from "@/components/notes/icons";
import { useMinute } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { numbersOf } from "@/lib/mindboard/branch";
import { boardOnWall, boardSummary, boardText, cleanTitle, defaultTitle, openPoints, splitBoards, summariesOf } from "@/lib/mindboard/list";
import { useCreateBoard, useDeleteBoard, useFinishBoard, useMovePoint, usePinBoard, useRenameBoard, useRestoreBoard } from "@/lib/mindboard/mutations";
import { useBoards, type MindBoard } from "@/lib/mindboard/queries";
import { hasContent, pointLabel, sketchFrom, type Sketch } from "@/lib/mindboard/sketch";
import type { SplitPoint } from "@/lib/mindboard/split";
import { branchesOf, nextPlaceIn } from "@/lib/mindboard/tree";
import { wallBoardOf } from "@/lib/mindboard/wall";
import { firstLine, phoneRow } from "@/lib/notes/list";
import { useCreateNote, useDeleteNote, useUpdateNote } from "@/lib/notes/mutations";
import { useNotes, type Note } from "@/lib/notes/queries";
import { usePendingNotes, useReplayHearing } from "@/lib/notes/replay";
import { useMe, useSentTasks } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { firstNameOf } from "@/lib/text/normalize";
import { tvTime } from "@/lib/tv/clock";
import { stageOf } from "@/lib/tv/board";
import { useTvBoardControl, useTvControl, useTvWeekBoard } from "@/lib/tv/mutations";
import { tvKeys, useTvState, type TvState } from "@/lib/tv/queries";
import { afterBoard, boardExtendTo, boardPointOf, boardViewOf, weekBoardLive } from "@/lib/tv/state";

import { DeskSketch } from "./DeskSketch";
import { Outline, type OutlineActions } from "./Outline";

const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

/**
 * A board on the right of «Заметки», for a keyboard and a mouse (wave 3, D-102, D-121, D-140):
 * the title (a click or F2 renames it), the moment in a line, «На стену» and «⋯» with everything
 * else a board can do; while it is on the wall — the presenter under the head. Below — the
 * outline, typed line after line (`Outline`). The data are the phone page's: the one notes cache
 * with what still waits on the phone laid over it, lines typed here shown at once (until the
 * cache has them), every write one mutation of `lib/notes` / `lib/mindboard` / `lib/tv`. The
 * dictaphone and «Раздать поручения» stay on the phone's board (`?view=phone` here).
 */
export function DeskBoard() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const notes = useNotes(me.data?.userId);
  const boards = useBoards(me.data?.userId);
  const pending = usePendingNotes(me.data?.userId);
  const heard = useReplayHearing();
  const tv = useTvState();
  const control = useTvControl();
  const boardControl = useTvBoardControl();
  const weekBoard = useTvWeekBoard();
  const create = useCreateNote(me.data);
  const update = useUpdateNote(me.data);
  const remove = useDeleteNote(me.data);
  const rename = useRenameBoard(me.data);
  const deleteBoard = useDeleteBoard(me.data);
  const restoreBoard = useRestoreBoard(me.data);
  const pin = usePinBoard(me.data);
  const finish = useFinishBoard(me.data);
  const createBoard = useCreateBoard(me.data);
  const movePoint = useMovePoint(me.data);
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  const now = useMinute();

  // lines typed here, shown from the keystroke until the cache has them (its write is async)
  const [typed, setTyped] = useState<Note[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [assigning, setAssigning] = useState<Note | null>(null);
  const [moving, setMoving] = useState<Note | null>(null);
  const [sketching, setSketching] = useState<{ row: Note | null } | null>(null);
  const [wallOpen, setWallOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // the board from the server, or — made without network — from the phone
  const board: MindBoard | null = useMemo(() => {
    const found = boards.data?.find((row) => row.id === id);
    if (found) return found;
    const kept = pending.boards.find((entry) => entry.id === id);
    if (!kept) return null;
    return { id: kept.id, company_id: kept.companyId, user_id: kept.userId, title: kept.title, deleted_at: null, pinned_at: null, finished_at: null, client_request_id: kept.crid, created_at: kept.createdAt, updated_at: kept.createdAt };
  }, [boards.data, pending.boards, id]);

  // the lines as the director should see them: the cache, edits still on the phone over their rows,
  // lines that exist only on the phone (D-95), and lines just typed here
  const { rows, phone } = useMemo(() => {
    const byId = new Map<string, Note>();
    for (const note of notes.data ?? []) if (note.board_id === id) byId.set(note.id, note);
    for (const edit of pending.edits) {
      const row = byId.get(edit.id);
      if (row) byId.set(edit.id, { ...row, ...edit.fields });
    }
    const phoneOnly = new Set<string>();
    for (const entry of pending.creates.filter((create) => create.boardId === id)) {
      if (byId.has(entry.id)) continue;
      phoneOnly.add(entry.id);
      byId.set(entry.id, phoneRow(entry));
    }
    for (const row of typed) if (!byId.has(row.id)) byId.set(row.id, row);
    return { rows: [...byId.values()].filter((note) => note.deleted_at === null), phone: phoneOnly };
  }, [notes.data, pending, id, typed]);

  const handed = rows.some((row) => row.converted_task_id !== null);
  const sent = useSentTasks(handed ? me.data?.userId : undefined);
  const taskById = useMemo(() => new Map((sent.data ?? []).map((task) => [task.id, task])), [sent.data]);
  const branches = useMemo(() => branchesOf(rows), [rows]);
  const numbers = useMemo(() => numbersOf(branches), [branches]);
  const others = useMemo(() => splitBoards(boards.data ?? [], now).live.filter((other) => other.id !== id), [boards.data, now, id]);
  const summaries = useMemo(() => summariesOf(notes.data ?? []), [notes.data]);

  const titleRef = useRef<() => void>(() => {});
  useEffect(() => {
    titleRef.current = () => setRenaming(true);
  });
  // F2 — rename, as on any desktop
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.code !== "F2" || document.body.hasAttribute("data-dialog-open") || document.body.hasAttribute("data-sheet-open")) return;
      event.preventDefault();
      titleRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useShortcuts("Доска", [
    { keys: ["Enter"], label: "Следующая строка (после пункта с подпунктами — подпункт)" },
    { keys: ["Shift Enter"], label: "Новая строка внутри пункта" },
    { keys: ["Tab"], label: "Сделать подпунктом" },
    { keys: ["Shift Tab"], label: "Вынести в пункты" },
    { keys: ["↑", "↓"], label: "По строкам" },
    { keys: ["Ctrl Enter"], label: "Отметить" },
    { keys: ["Ctrl Shift ↑", "↓"], label: "Переставить выше или ниже" },
    { keys: ["⌫"], label: "В пустой строке — убрать её" },
    { keys: ["Ctrl Shift ⌫"], label: "Строку в корзину" },
    { keys: ["F2"], label: "Переименовать доску" },
    { keys: ["Esc"], label: "Выйти из строки" },
  ]);

  if (me.isLoading || notes.isLoading || boards.isLoading || !me.data) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-8 pt-6" aria-hidden>
        <span className="block h-[34px] w-1/2 rounded-[10px] bg-surface-2/70" />
        <span className="mt-6 block h-[320px] rounded-[12px] bg-surface-2/50" />
      </div>
    );
  }

  if (!board || board.deleted_at) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-6 pt-16" data-testid="board-missing">
        <EmptyState
          title="Доски нет"
          hint={board?.deleted_at ? "Она в корзине — вернуть можно там" : "Возможно, она удалена"}
          action={
            <Link href="/desk/notes?tab=boards" className="text-[14px] font-semibold text-accent hover:underline">
              К доскам ›
            </Link>
          }
        />
      </div>
    );
  }

  const meData = me.data;
  const onWall = boardOnWall(tv.data, board.id, now);
  const until = onWall && tv.data?.board_until ? new Date(tv.data.board_until) : null;
  const spot = onWall ? boardPointOf(tv.data ?? null, now) : null;
  const summary = boardSummary(rows);
  const open = openPoints(rows.filter((row) => !phone.has(row.id)));
  const ticks = rows.filter((row) => row.done_at !== null && !phone.has(row.id));
  const openBoard = (boardId: string) => router.push(`/desk/notes/b/${boardId}`);
  const preview = wallBoardOf(board, rows.filter((row) => !phone.has(row.id)), { view: boardViewOf(tv.data ?? null), focus: spot }, (row) => {
    const task = row.converted_task_id ? taskById.get(row.converted_task_id) : undefined;
    if (!task || task.status === "revoked") return null;
    return { assignee: firstNameOf(task.assignee?.full_name) || null, done: task.status === "done", stage: stageOf(task.status) };
  });
  const presenterPoints = branches
    .filter((branch) => branch.point.parent_id === null && hasContent(branch.point))
    .map((branch) => ({ id: branch.point.id, text: firstLine(pointLabel(branch.point.text, branch.point.sketch)), done: branch.point.done_at !== null }));

  /** A line written here: on screen at once, a note on the server (and on the phone till it lands). */
  const write = (row: { id: string; text: string; parent_id: string | null; position: number; sketch?: Sketch | null }) => {
    const at = new Date().toISOString();
    // the lines the cache has by now are no longer kept here
    const cached = new Set((notes.data ?? []).map((note) => note.id));
    setTyped((list) => [
      ...list.filter((line) => !cached.has(line.id)),
      {
        id: row.id,
        company_id: meData.companyId,
        user_id: meData.userId,
        text: row.text,
        raw_transcript: null,
        audio_path: null,
        inbox_item_id: null,
        pinned: false,
        board_id: board.id,
        position: row.position,
        parent_id: row.parent_id,
        done_at: null,
        converted_task_id: null,
        converted_announcement_id: null,
        converted_at: null,
        deleted_at: null,
        remind_at: null,
        reminded_at: null,
        sketch: row.sketch ?? null,
        client_request_id: null,
        created_at: at,
        updated_at: at,
      },
    ]);
    create.mutate({ id: row.id, text: row.text, client_request_id: crypto.randomUUID(), board_id: board.id, position: row.position, parent_id: row.parent_id, ...(row.sketch ? { sketch: row.sketch } : {}) });
  };

  const eject = () =>
    // the wall goes to the face — or to the round, while a week board waits in it (D-144)
    control.mutate(afterBoard(tv.data ?? null, new Date()), { onSuccess: () => ejectReceipt(queryClient, meData, board, notes.data ?? [], openBoard) });
  const putUp = () => control.mutate({ board: board.id }, { onSuccess: (row) => toast(row.board_until ? `Доска на стене до ${tvTime(new Date(row.board_until))}` : "Доска на стене") });
  const extend = () =>
    boardControl.mutate(
      // from the row as the cache holds it this instant: clicks in a row add up, a repeat does not
      { until: boardExtendTo(queryClient.getQueryData<TvState | null>(tvKeys.state) ?? null, EXTEND_MINUTES, new Date()).toISOString() },
      { onSuccess: (row) => toast(row.board_until ? `Доска на стене до ${tvTime(new Date(row.board_until))}` : "Продлил") },
    );

  const actions: OutlineActions = {
    create: write,
    edit: (row, fields) => {
      // a line still only typed here: its fields go with it when it lands
      if (typed.some((line) => line.id === row.id) && !notes.data?.some((note) => note.id === row.id)) setTyped((list) => list.map((line) => (line.id === row.id ? { ...line, ...fields } : line)));
      update.mutate({ id: row.id, ...fields });
    },
    remove: (row) => {
      const kids = rows.filter((child) => child.parent_id === row.id).length;
      const sub = row.parent_id !== null && rows.some((other) => other.id === row.parent_id);
      setTyped((list) => list.filter((line) => line.id !== row.id));
      remove.mutate({
        id: row.id,
        at: new Date().toISOString(),
        words: { done: sub ? "Подпункт в корзине" : kids > 0 ? `Пункт и ${kids} ${pluralRu(kids, ["подпункт", "подпункта", "подпунктов"])} в корзине` : "Пункт в корзине", undo: "Вернуть" },
      });
    },
    assign: setAssigning,
    move: setMoving,
    spotlight: (pointId) => boardControl.mutate(pointId ? { point: pointId } : { clearPoint: true }),
    sketch: (row) => setSketching({ row }),
    writeMany: (points: SplitPoint[], at) => {
      if (at.parent) {
        let place = nextPlaceIn(rows, at.parent);
        for (const text of points.flatMap((point) => [point.text, ...point.children]).filter((line) => line.trim())) write({ id: crypto.randomUUID(), text, parent_id: at.parent, position: place++ });
        return;
      }
      // points in their order, each with its sub-points: after a point, or at the bottom
      const anchor = at.after ? branches.findIndex((branch) => branch.point.id === at.after) : -1;
      const next = anchor >= 0 ? (branches[anchor + 1]?.point.position ?? null) : null;
      let from = anchor >= 0 ? (branches[anchor].point.position ?? 0) : nextPlaceIn(rows, null) - 1;
      const stepBy = next !== null ? (next - from) / (points.length + 1) : 1;
      for (const point of points) {
        from += stepBy;
        const pointId = crypto.randomUUID();
        write({ id: pointId, text: point.text, parent_id: null, position: from });
        point.children.forEach((child, index) => write({ id: crypto.randomUUID(), text: child, parent_id: pointId, position: index + 1 }));
      }
      toast(`${points.length} ${pluralRu(points.length, ["пункт", "пункта", "пунктов"])} из списка`);
    },
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(boardText(board.title, rows));
      toast("Скопировал доску текстом");
    } catch {
      toast("Не получилось скопировать");
    }
  };
  const untickAll = () => {
    for (const row of ticks) update.mutate({ id: row.id, done_at: null });
    toast(`Снял ${ticks.length} ${pluralRu(ticks.length, ["отметку", "отметки", "отметок"])}`, {
      action: { label: "Вернуть", onClick: () => ticks.forEach((row) => update.mutate({ id: row.id, done_at: row.done_at })) },
    });
  };

  const wallItems: MenuItem[] = onWall
    ? [
        { key: "extend", label: `Ещё ${EXTEND_MINUTES} минут`, onSelect: extend },
        { key: "look", label: "Вид и время на стене…", onSelect: () => setWallOpen(true) },
        "separator",
        { key: "eject", label: "Убрать со стены", danger: true, onSelect: eject },
      ]
    : [
        { key: "up", label: "На стену до вечера", onSelect: putUp },
        { key: "look", label: "Вид, время, доска недели…", onSelect: () => setWallOpen(true) },
      ];

  const menuItems: MenuItem[] = [
    { key: "rename", label: "Переименовать", hint: "F2", icon: <NoteIcon name="pencil" size={14} />, onSelect: () => setRenaming(true) },
    {
      key: "pin",
      label: board.pinned_at ? "Открепить" : "Закрепить сверху",
      icon: <NoteIcon name="pin" size={14} />,
      onSelect: () => {
        pin.mutate({ id: board.id, on: !board.pinned_at });
        toast(board.pinned_at ? "Открепил" : "Закрепил сверху списка");
      },
    },
    { key: "sketch", label: "Рисунок — новым пунктом…", icon: <NoteIcon name="pencil" size={14} />, onSelect: () => setSketching({ row: null }) },
    ...(open.length > 0 ? [{ key: "copy", label: `Новая доска из открытых · ${openWords(open.length)}`, icon: <NoteIcon name="stack" size={14} />, onSelect: () => void carryOver(queryClient, meData, board, openBoard) }] : []),
    ...(ticks.length > 0 ? [{ key: "untick", label: `Снять все отметки · ${ticks.length}`, icon: <NoteIcon name="retry" size={14} />, onSelect: untickAll }] : []),
    ...(summary.total > 0 ? [{ key: "text", label: "Скопировать текстом", icon: <NoteIcon name="copy" size={14} />, onSelect: () => void copyText() }] : []),
    { key: "phone", label: "Диктофон и раздача поручений…", icon: <NoteIcon name="mic" size={14} />, onSelect: () => router.push(`/desk/notes/b/${board.id}?view=phone`) },
    "separator",
    {
      key: "finish",
      label: board.finished_at ? "Вернуть в работу" : "Завершить доску",
      icon: <NoteIcon name={board.finished_at ? "restore" : "flag"} size={14} />,
      onSelect: () => {
        finish.mutate({ id: board.id, on: !board.finished_at });
        toast(board.finished_at ? "Доска снова в работе" : "Доска завершена — она в «Завершённых»");
      },
    },
    { key: "delete", label: "Удалить доску", danger: true, icon: <NoteIcon name="trash" size={14} />, onSelect: () => setConfirmDelete(true) },
  ];

  const stateLine = [
    summary.total > 0 ? `${summary.total} ${pluralRu(summary.total, ["пункт", "пункта", "пунктов"])}` : "Пока пусто",
    summary.subs > 0 ? `${summary.subs} ${pluralRu(summary.subs, ["подпункт", "подпункта", "подпунктов"])}` : "",
    summary.done > 0 ? `${summary.done} ${pluralRu(summary.done, ["отмечен", "отмечено", "отмечено"])}` : "",
    board.finished_at ? "завершена" : board.pinned_at ? "закреплена" : "",
    !online ? "нет связи — строки ждут на этом компьютере" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  // a drawing goes back on its point, or comes as a new point (D-141)
  const saveSketch = (sketch: Sketch | null, caption: string) => {
    const row = sketching?.row ?? null;
    setSketching(null);
    if (!row) {
      if (sketch || caption) write({ id: crypto.randomUUID(), text: caption, parent_id: null, position: nextPlaceIn(rows, null), sketch });
      return;
    }
    const [first = "", ...rest] = row.text.trim().split("\n");
    const text = caption === first.trim() ? null : [caption, ...rest].join("\n").trim();
    update.mutate({ id: row.id, sketch, ...(text === null ? {} : { text }) });
    toast(sketch ? "Рисунок сохранён" : "Рисунок стёрт — пункт остался");
  };

  // «На другую доску» (D-140): to the bottom of the chosen board; a new board is made first
  const moveTo = (target: { id: string; fresh: boolean }) => {
    const row = moving;
    setMoving(null);
    if (!row) return;
    const position = target.fresh ? 1 : nextPlaceIn((notes.data ?? []).filter((note) => note.board_id === target.id && note.deleted_at === null), null);
    movePoint.mutate(
      { note: row, to: { boardId: target.id, position } },
      { onSuccess: () => toast(`Пункт на доске «${target.fresh ? defaultTitle(new Date()) : (boards.data?.find((other) => other.id === target.id)?.title ?? "")}»`, { action: { label: "Открыть", onClick: () => openBoard(target.id) } }) },
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-8 pb-16 pt-6" data-testid="desk-board">
      <DeskLight tone={onWall ? "accent" : null} />
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <TitleField
              title={board.title}
              onDone={(title) => {
                setRenaming(false);
                if (title !== board.title) rename.mutate({ id: board.id, title });
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <Tooltip label="Переименовать" keys={["F2"]} side="bottom">
              <h1>
                <button type="button" onClick={() => setRenaming(true)} className="max-w-full truncate text-left font-display text-[28px] font-bold leading-[34px] tracking-[-0.025em] hover:text-text/85" data-testid="desk-board-title">
                  {board.title}
                </button>
              </h1>
            </Tooltip>
          )}
          <p className="mt-1 flex items-center gap-1.5 text-[14px] font-medium leading-5" style={{ color: onWall ? "var(--accent)" : "var(--text-muted)" }}>
            {onWall ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
            {onWall ? `На стене${until ? ` до ${tvTime(until)}` : ""} · ` : ""}
            {stateLine}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          {onWall ? (
            <MenuButton items={wallItems} label="Доска на стене" align="end" width={240} className="btn-primary inline-flex min-h-[36px] items-center gap-1.5 rounded-[12px] px-3 font-display text-[13px] font-semibold leading-4 text-bg">
              <NoteIcon name="wall" size={15} />
              На стене{until ? ` до ${tvTime(until)}` : ""}
            </MenuButton>
          ) : (
            <Button size="sm" variant="secondary" icon={<NoteIcon name="wall" size={15} />} disabled={control.isPending} onClick={putUp} data-testid="desk-board-on-wall">
              На стену
            </Button>
          )}
          <MenuButton items={menuItems} label="Все действия с доской" align="end" width={300} className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5.5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="18.5" cy="12" r="1.7" />
            </svg>
          </MenuButton>
        </div>
      </header>

      {/* ◀ ✓ ▶ of the meeting on the wall — the screen's presenter, here while this board is up */}
      {onWall ? <DeskPresenter boardId={board.id} points={presenterPoints} now={now} /> : null}

      <Outline rows={rows} phone={phone} hearing={heard} numbers={numbers} spot={spot} onWall={onWall} taskOf={(row) => (row.converted_task_id ? taskById.get(row.converted_task_id) : undefined)} actions={actions} autoStart={rows.length === 0} />

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-[12px] leading-4 text-muted">
        <span className="inline-flex items-center gap-1">
          <Kbd>Enter</Kbd> строка
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Tab</Kbd> подпункт
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Shift Tab</Kbd> в пункты
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Ctrl Enter</Kbd> отметить
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>?</Kbd> все клавиши
        </span>
        <span className="ml-auto">Порядок — за ручку слева от строки</span>
      </p>

      <AssignSheet note={assigning} onClose={() => setAssigning(null)} me={meData} />
      <BoardPicker
        open={moving !== null}
        onClose={() => setMoving(null)}
        subject={moving ? firstLine(moving.text) : null}
        boards={others}
        summaries={summaries}
        onPick={(other) => moveTo({ id: other.id, fresh: false })}
        onNew={() => {
          if (!navigator.onLine) {
            setMoving(null);
            toast("Нет связи — пункт остался на этой доске");
            return;
          }
          const fresh = crypto.randomUUID();
          createBoard.mutate({ id: fresh, title: defaultTitle(new Date()), client_request_id: crypto.randomUUID() }, { onSuccess: () => moveTo({ id: fresh, fresh: true }) });
        }}
      />
      <WallSheet
        open={wallOpen}
        onClose={() => setWallOpen(false)}
        data={preview}
        now={now}
        onWall={onWall}
        until={until}
        busy={control.isPending || boardControl.isPending}
        week={{
          can: !board.finished_at,
          on: tv.data?.week_board_id === board.id && weekBoardLive(tv.data ?? null, now),
          taken: tv.data?.week_board_id !== board.id && weekBoardLive(tv.data ?? null, now),
          busy: weekBoard.isPending,
        }}
        onWeek={(on) => weekBoard.mutate(on ? board.id : null, { onSuccess: () => toast(on ? "Доска недели — в круге заставок до воскресенья, 21:00" : "Доска ушла из круга заставок") })}
        onView={(view) => boardControl.mutate({ view })}
        onShow={(minutes) => control.mutate({ board: board.id, ...(minutes ? { boardMinutes: minutes } : {}) }, { onSuccess: (row) => toast(row.board_until ? `Доска на стене до ${tvTime(new Date(row.board_until))}` : "Доска на стене") })}
        onExtend={extend}
        onEject={() => {
          setWallOpen(false);
          eject();
        }}
      />
      {sketching ? (
        <DeskSketch
          initial={sketching.row ? sketchFrom(sketching.row.sketch) : null}
          caption={sketching.row?.text.trim().split("\n")[0].trim() ?? ""}
          editing={sketching.row !== null}
          onClose={() => setSketching(null)}
          onSave={saveSketch}
        />
      ) : null}
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Удалить доску" width="sm">
        <p className="text-[14px] leading-5 text-muted">
          {summary.total > 0
            ? `«${board.title}» и её ${summary.total} ${pluralRu(summary.total, ["пункт", "пункта", "пунктов"])} уйдут в корзину. Три дня их можно вернуть.`
            : `«${board.title}» уйдёт в корзину. Три дня её можно вернуть.`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(false)}>
            Не сейчас
          </Button>
          <Button
            size="sm"
            variant="danger"
            data-testid="desk-board-delete-confirm"
            onClick={() => {
              setConfirmDelete(false);
              const boardId = board.id;
              deleteBoard.mutate({ id: boardId });
              toast("Доска в корзине", { action: { label: "Вернуть", onClick: () => restoreBoard.mutate({ id: boardId }) } });
              router.push("/desk/notes?tab=boards");
            }}
          >
            Удалить
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/** The title in place: Enter or leaving keeps it, Esc gives the old one back, an empty field keeps the old. */
function TitleField({ title, onDone, onCancel }: { title: string; onDone: (title: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(title);
  const field = useRef<HTMLInputElement>(null);
  // Enter, Esc and the blur that follows them answer once
  const answered = useRef(false);
  const finish = (next: string | null) => {
    if (answered.current) return;
    answered.current = true;
    if (next === null) onCancel();
    else onDone(next);
  };
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  return (
    <input
      ref={field}
      value={draft}
      maxLength={120}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(cleanTitle(draft, title))}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(cleanTitle(draft, title));
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(null);
        }
      }}
      aria-label="Название доски"
      data-testid="desk-board-title-input"
      className="-ml-2 w-[calc(100%+8px)] rounded-[10px] bg-surface-2/60 px-2 font-display text-[28px] font-bold leading-[34px] tracking-[-0.025em] outline-none ring-2 ring-accent/40"
    />
  );
}
