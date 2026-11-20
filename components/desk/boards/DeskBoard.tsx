"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Presentation, Send } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { MoreMenu } from "@/components/desk/ui/IconButton";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskPage } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { keysTaken } from "@/components/desk/ui/layers";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { useDeskVoiceClaim } from "@/components/desk/voice/claim";
import { DictationMic, useDeskDictationKeys } from "@/components/desk/voice/DictationMic";
import { BoardPicker } from "@/components/mindboard/BoardPicker";
import { VIEW_LABEL } from "@/components/mindboard/BoardPresenter";
import { carryOver } from "@/components/mindboard/carry";
import { WallPreview } from "@/components/mindboard/WallPreview";
import { EXTEND_MINUTES, WallSheet } from "@/components/mindboard/WallSheet";
import { AssignSheet } from "@/components/notes/AssignSheet";
import { NoteIcon } from "@/components/notes/icons";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { isTypingTarget } from "@/lib/desk/keys";
import { numbersOf } from "@/lib/mindboard/branch";
import { BOARD_TRASH_DAYS, boardOnWall, boardSummary, openPoints } from "@/lib/mindboard/list";
import { copyBoardText, saveSketch, untickAll, useBoardMoves } from "@/lib/mindboard/moves";
import { usePointToThought } from "@/lib/mindboard/mutations";
import { sketchFrom, type Sketch } from "@/lib/mindboard/sketch";
import type { SplitPoint } from "@/lib/mindboard/split";
import { branchesOf, nextPlaceIn } from "@/lib/mindboard/tree";
import { useBoardRows, useBoardWrites } from "@/lib/mindboard/useBoard";
import { wallBoardOf, wallNote } from "@/lib/mindboard/wall";
import { useDictation, type Receipt } from "@/lib/notes/dictation";
import { draftRow, firstLine } from "@/lib/notes/list";
import type { NoteFields } from "@/lib/notes/pending";
import { noteKeys, type Note } from "@/lib/notes/queries";
import { useSentTasks } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { firstNameOf } from "@/lib/text/normalize";
import { stageOf } from "@/lib/tv/board";
import { tvTime } from "@/lib/tv/clock";
import { presenterPoints } from "@/lib/tv/presenter";
import { tvKeys, type TvState } from "@/lib/tv/queries";
import { BOARD_VIEWS, boardExtendTo, boardPointOf, boardViewOf, weekBoardLive, type BoardView } from "@/lib/tv/state";
import { useNow } from "@/lib/useNow";

import { boardMenu, boardStateLine, type BoardCounts } from "./boardMenu";
import { BoardBones, BoardKeys, TitleField } from "./BoardParts";
import { darkPaper, DeskSketch } from "./DeskSketch";
import { HandOut } from "./HandOut";
import { MeetingStage } from "./MeetingStage";
import { Outline, type OutlineActions } from "./Outline";
import { ThoughtsPicker } from "./ThoughtsPicker";

const EMPTY: Note[] = [];

/** The board's three forms (D-177): preparing it, handing its points out, leading the meeting by it. */
type Mode = "prep" | "handout" | "lead";

/** What the board's dictaphone says it does — one microphone on the screen (D-81). */
const VOICE_LABEL = "Сказать пункт — слово в слово";

/**
 * A board of «Доски» (D-102, D-121, D-140, D-177) on the whole work area, in three forms.
 *
 * Preparing: «‹ Доски», the title (a click or F2 renames it, it truncates instead of running over
 * its buttons), the state said once, «На стену» (the one white button) or — while it is up —
 * «Вести совещание», and «⋯» with the rest. Left, the outline typed line after line (`Outline`)
 * with the board's dictaphone on the line of a new point: one recording, one point, kept before
 * any AI (`useDictation`, principle 5; «V» while the board holds the desk's voice). Right, «Как
 * увидит кабинет» — the real wall drawing (`WallPreview`), «Список · Карта» — and «Добавить из
 * мыслей…» behind a button (the room may see this screen).
 *
 * «Раздать поручения»: a «Кому» column over the lines and one «Отправить N» (`HandOut`).
 *
 * «Ведущий» — only by «Вести совещание» (or `?lead=1` from the gallery's hero), never by itself:
 * the head becomes the live strip of the wall, the outline a narrow column with the lit point, and
 * the stage (`MeetingStage`) the mirror of the wall with the commands. Esc goes back to preparing.
 *
 * The data are the phone's: the one notes cache with what still waits on this computer laid over
 * it, lines typed here shown at once, every write one mutation of `lib/notes`/`lib/mindboard`/`lib/tv`.
 */
export function DeskBoard() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  // lines typed here, shown from the keystroke until the cache has them (its write is async)
  const [typed, setTyped] = useState<Note[]>([]);
  // the board and its lines with what still waits on this computer laid over them (D-95), and lines just typed
  const data = useBoardRows(id, typed);
  const { me, notes, heard, tv, board, rows, phone, online } = data;
  const writes = useBoardWrites(me.data);
  const { create, update, remove, rename, deleteBoard, restoreBoard, pin, finish, movePoint, control, boardControl, weekBoard } = writes;
  const toThought = usePointToThought(me.data);
  const now = useNow();
  const openBoard = (boardId: string) => router.push(`/desk/boards/${boardId}`);
  const moves = useBoardMoves(data, writes, openBoard, now);

  const [renaming, setRenaming] = useState(false);
  const [assigning, setAssigning] = useState<Note | null>(null);
  const [sketching, setSketching] = useState<{ row: Note | null } | null>(null);
  const [wallOpen, setWallOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useState<Mode>(() => (params.get("lead") ? "lead" : "prep"));
  // «Список · Карта» of the preview while the board is not up: the wall's own choice once it is
  const [previewView, setPreviewView] = useState<BoardView | null>(null);

  // the board's dictaphone: one recording — the next point at the bottom (principle 5: kept before any AI)
  const isMine = useDeskVoiceClaim(VOICE_LABEL);
  const rowsNow = useRef(rows);
  useEffect(() => {
    rowsNow.current = rows;
  });
  const dictation = useDictation(
    me.data,
    (receipt: Receipt) => {
      // a point said comes on the board by itself; only what went wrong is told
      if (receipt.tone === "warn") toast(`${receipt.eyebrow} · ${receipt.headline}`);
    },
    { boardId: id, nextPosition: () => nextPlaceIn(rowsNow.current, null), parentId: () => null },
  );
  useDeskDictationKeys(dictation, isMine);
  const hearing = useMemo(() => (dictation.busy.size === 0 ? heard : new Set([...heard, ...dictation.busy])), [heard, dictation.busy]);

  const onWallNow = board ? boardOnWall(tv.data, board.id, now) : false;
  const leading = mode === "lead" && onWallNow;
  const handed = rows.some((row) => row.converted_task_id !== null);
  const sent = useSentTasks(handed || leading ? me.data?.userId : undefined);
  const taskById = useMemo(() => new Map((sent.data ?? []).map((task) => [task.id, task])), [sent.data]);
  const branches = useMemo(() => branchesOf(rows), [rows]);
  const numbers = useMemo(() => numbersOf(branches), [branches]);
  const steps = useMemo(() => presenterPoints(rows.filter((row) => !phone.has(row.id)), id), [rows, phone, id]);

  const titleRef = useRef<() => void>(() => {});
  const leaveRef = useRef<() => boolean>(() => false);
  useEffect(() => {
    titleRef.current = () => setRenaming(true);
  });
  // F2 — rename, as on any desktop — but not over a line being typed; Esc leaves «Ведущий» and the hand-out
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || keysTaken()) return;
      if (event.code === "F2" && !isTypingTarget(event.target)) {
        event.preventDefault();
        titleRef.current();
      } else if (event.key === "Escape") {
        // a line being typed keeps its Esc; an empty «Кому» of the hand-out lets it go
        const target = event.target as HTMLElement | null;
        if (isTypingTarget(event.target) && !target?.hasAttribute?.("data-handout")) return;
        if (leaveRef.current()) event.preventDefault();
      }
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
    { keys: ["V"], label: "Сказать пункт голосом — слово в слово" },
    { keys: ["F2"], label: "Переименовать доску" },
    { keys: ["Esc"], label: "Выйти из строки" },
  ]);

  /** «Выйти из ведущего», Esc, «Готово» of the hand-out: back to preparing; `?lead=1` leaves the address. */
  const leave = () => {
    setMode("prep");
    if (params.get("lead")) router.replace(`/desk/boards/${id}`, { scroll: false });
  };
  useEffect(() => {
    leaveRef.current = () => {
      if (mode === "prep") return false;
      leave();
      return true;
    };
  });

  // the board went off the wall: «Ведущий» has nothing to lead — back to preparing
  const wasLeading = useRef(false);
  useEffect(() => {
    if (wasLeading.current && !leading && mode === "lead") setMode("prep");
    wasLeading.current = leading;
  }, [leading, mode]);

  if (data.loading || !me.data) return <BoardBones />;

  if (!board || board.deleted_at) {
    return (
      <DeskPage width="narrow">
        <div className="pt-10" data-testid="board-missing">
          <EmptyState
            title="Доски нет"
            hint={board?.deleted_at ? "Она в корзине — вернуть можно там" : "Возможно, она удалена"}
            action={
              <Link href={board?.deleted_at ? "/desk/boards?tab=trash" : "/desk/boards"} className="text-[14px] font-medium underline">
                {board?.deleted_at ? "В корзину ›" : "К доскам ›"}
              </Link>
            }
          />
        </div>
      </DeskPage>
    );
  }

  const meData = me.data;
  const onWall = onWallNow;
  const until = onWall && tv.data?.board_until ? new Date(tv.data.board_until) : null;
  const left = until ? Math.max(0, Math.round((until.getTime() - now.getTime()) / 60_000)) : null;
  const spot = onWall ? boardPointOf(tv.data ?? null, now) : null;
  const summary = boardSummary(rows);
  const open = openPoints(rows.filter((row) => !phone.has(row.id)));
  const ticks = rows.filter((row) => row.done_at !== null && !phone.has(row.id));
  const toHand = rows.filter((row) => row.text.trim() && row.converted_task_id === null && !phone.has(row.id)).length;
  const counts: BoardCounts = { summary, toHand, open: open.length, ticks: ticks.length, handed: rows.filter((row) => row.converted_task_id !== null).length };
  const wallView = onWall ? boardViewOf(tv.data ?? null) : (previewView ?? boardViewOf(tv.data ?? null));
  const taskOf = (row: Note) => (row.converted_task_id ? taskById.get(row.converted_task_id) : undefined);
  const preview = wallBoardOf(board, rows.filter((row) => !phone.has(row.id)), { view: wallView, focus: spot }, (row) => {
    const task = taskOf(row);
    if (!task || task.status === "revoked") return null;
    return { assignee: firstNameOf(task.assignee?.full_name) || null, done: task.status === "done", stage: stageOf(task.status) };
  });

  /** A line written here: on screen at once, a note on the server (and kept here till it lands). */
  const write = (row: { id: string; text: string; parent_id: string | null; position: number; sketch?: Sketch | null }) => {
    // the lines the cache has by now are no longer kept here
    const cached = new Set((notes.data ?? []).map((note) => note.id));
    const line = draftRow({ ...row, sketch: row.sketch ?? null, company_id: meData.companyId, user_id: meData.userId, board_id: board.id, created_at: new Date().toISOString() });
    setTyped((list) => [...list.filter((kept) => !cached.has(kept.id)), line]);
    create.mutate({ id: row.id, text: row.text, client_request_id: crypto.randomUUID(), board_id: board.id, position: row.position, parent_id: row.parent_id, ...(row.sketch ? { sketch: row.sketch } : {}) });
  };

  const putUp = () => control.mutate({ board: board.id }, { onSuccess: (row) => toast(row.board_until ? `Доска на стене до ${tvTime(new Date(row.board_until))}` : "Доска на стене") });
  const extend = () =>
    boardControl.mutate(
      // from the row as the cache holds it this instant: clicks in a row add up, a repeat does not
      { until: boardExtendTo(queryClient.getQueryData<TvState | null>(tvKeys.state) ?? null, EXTEND_MINUTES, new Date()).toISOString() },
      { onSuccess: (row) => toast(row.board_until ? `Доска на стене до ${tvTime(new Date(row.board_until))}` : "Продлил") },
    );

  const openSketch = (row: Note | null) => {
    darkPaper();
    setSketching({ row });
  };

  /** «В мысли»: a plain line back to «Заметки», with «Отменить» that puts it back where it stood. */
  const backToThoughts = (row: Note) => {
    const place = { boardId: board.id, position: row.position ?? nextPlaceIn(rows, null) };
    toThought.mutate(
      { id: row.id },
      {
        onSuccess: () =>
          toast("Пункт снова в мыслях", {
            action: {
              label: "Отменить",
              onClick: () => {
                const note = queryClient.getQueryData<Note[]>(noteKeys.mine(meData.userId))?.find((line) => line.id === row.id);
                if (note) movePoint.mutate({ note, to: place });
              },
            },
          }),
      },
    );
  };

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
    move: moves.move,
    spotlight: (pointId) => boardControl.mutate(pointId ? { point: pointId } : { clearPoint: true }),
    sketch: openSketch,
    toThought: backToThoughts,
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

  /** One line's change written as it is (no line typed here is touched). */
  const writeLine = (row: Note, fields: NoteFields) => update.mutate({ id: row.id, ...fields });
  // «В корзину» here does what it does under the gallery's «⋯»: at once, the toast brings it back
  const binIt = () => {
    const boardId = board.id;
    deleteBoard.mutate({ id: boardId });
    toast(`Доска в корзине — ${BOARD_TRASH_DAYS} дня можно вернуть`, { action: { label: "Вернуть", onClick: () => restoreBoard.mutate({ id: boardId }) } });
    router.push("/desk/boards");
  };

  const menuItems = boardMenu(board, onWall, counts, {
    rename: () => setRenaming(true),
    pin: (on) => pin.mutate({ id: board.id, on }),
    handout: () => setMode("handout"),
    sketch: () => openSketch(null),
    carry: () => void carryOver(queryClient, meData, board, openBoard),
    untick: () => untickAll(rows, phone, writeLine),
    copy: () => void copyBoardText(board.title, rows),
    extend,
    look: () => setWallOpen(true),
    eject: moves.eject,
    finish: (on) => finish.mutate({ id: board.id, on }),
    bin: binIt,
  });

  // a drawing goes back on its point, or comes as a new point (D-141)
  const saveIt = (sketch: Sketch | null, caption: string) => {
    const row = sketching?.row ?? null;
    setSketching(null);
    saveSketch(row, sketch, caption, { edit: writeLine, add: (drawn, words) => write({ id: crypto.randomUUID(), text: words, parent_id: null, position: nextPlaceIn(rows, null), sketch: drawn }) });
  };

  // «Добавить из мыслей…»: the thought at the bottom of this board, «Отменить» sends it back with its reminder and pin
  const addThought = (note: Note) => {
    // a reminder that has rung stays rung: putting its past time back would ring it again
    const restore = { remind_at: note.reminded_at ? null : note.remind_at, pinned: note.pinned };
    movePoint.mutate(
      { note, to: { boardId: board.id, position: nextPlaceIn(rows, null) } },
      { onSuccess: () => toast(`На доске: «${firstLine(note.text) || "голосовая мысль"}»`, { action: { label: "Отменить", onClick: () => toThought.mutate({ id: note.id, restore }) } }) },
    );
  };

  const mic = <DictationMic dictation={dictation} label={VOICE_LABEL} testId="board-mic" />;
  const outline = (compact: boolean) => (
    <Outline
      rows={rows}
      phone={phone}
      hearing={hearing}
      numbers={numbers}
      spot={spot}
      onWall={onWall}
      taskOf={taskOf}
      actions={actions}
      autoStart={rows.length === 0 && !compact}
      tail={mic}
      addLabel={compact ? "Пункт с совещания" : "Пункт — пишите, Enter · Tab — подпункт"}
      compact={compact}
    />
  );

  const title = renaming ? (
    <TitleField
      title={board.title}
      onDone={(next) => {
        setRenaming(false);
        if (next !== board.title) rename.mutate({ id: board.id, title: next });
      }}
      onCancel={() => setRenaming(false)}
    />
  ) : (
    <Tooltip label="Переименовать" keys={["F2"]} side="bottom" className="flex min-w-0 max-w-full">
      <h1 className="min-w-0 max-w-full">
        <button type="button" onClick={() => setRenaming(true)} className="board-title block max-w-full truncate text-left hover:text-text/85" data-testid="desk-board-title" title={board.title}>
          {board.title}
        </button>
      </h1>
    </Tooltip>
  );

  return (
    <DeskPage width="full">
      <div className="board-page flex w-full flex-col gap-4" data-testid="desk-board" data-mode={leading ? "lead" : mode === "handout" ? "handout" : "prep"}>
        <header className="board-head flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <Link href="/desk/boards" className="board-back desk-focus" data-testid="board-back">
              <ChevronLeft aria-hidden size={14} strokeWidth={2.2} />
              Доски
            </Link>
            {title}
            {leading ? null : (
              <p className="mt-1 truncate text-[14px] leading-5 text-muted" data-testid="board-state">
                {onWall ? <span aria-hidden className="board-live-dot" /> : null}
                {boardStateLine(board, counts, { until, online })}
              </p>
            )}
            {/* how far the board has come: the ticked points of all */}
            {!leading && summary.total > 0 && summary.done > 0 ? (
              <span aria-hidden className="boards-meter board-head-meter" style={{ "--done": summary.done / summary.total } as CSSProperties} title={`Отмечено ${summary.done} из ${summary.total}`}>
                <i />
              </span>
            ) : null}
          </div>
          {leading ? (
            <div className="board-live-strip" data-testid="board-live-strip">
              <span aria-hidden className="board-live-dot" />
              <b>На стене</b>
              <span className="nums text-muted">
                {left !== null && left <= 90 ? `ещё ${left} мин · ` : ""}
                {until ? `до ${tvTime(until)}` : ""}
              </span>
              <Button size="sm" variant="secondary" onClick={extend} disabled={boardControl.isPending}>
                +{EXTEND_MINUTES} мин
              </Button>
              <Button size="sm" variant="ghost" onClick={moves.eject} disabled={control.isPending}>
                Убрать со стены
              </Button>
              <Button size="sm" variant="ghost" onClick={leave} data-testid="board-lead-exit">
                Выйти из ведущего <Kbd>Esc</Kbd>
              </Button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2 pb-1">
              {mode !== "handout" && toHand > 0 ? (
                <Button size="sm" variant="secondary" icon={<Send aria-hidden size={14} strokeWidth={2.2} />} onClick={() => setMode("handout")} data-testid="desk-board-handout">
                  Раздать поручения
                </Button>
              ) : null}
              {onWall ? (
                <Button size="sm" variant={mode === "handout" ? "secondary" : "primary"} icon={<Presentation aria-hidden size={15} strokeWidth={2.2} />} onClick={() => setMode("lead")} data-testid="desk-board-lead">
                  Вести совещание
                </Button>
              ) : (
                <Button size="sm" variant={mode === "handout" ? "secondary" : "primary"} icon={<NoteIcon name="wall" size={15} />} disabled={control.isPending} onClick={putUp} data-testid="desk-board-on-wall">
                  На стену
                </Button>
              )}
              <MoreMenu items={menuItems} label="Все действия с доской" width={300} testId="desk-board-more" />
            </div>
          )}
        </header>

        {leading ? (
          <div className="board-lead-body">
            <div className="min-w-0">{outline(true)}</div>
            <MeetingStage boardId={board.id} rows={rows} points={steps} now={now} me={meData} taskOf={taskOf} sent={sent.data ?? []} onOther={setAssigning} />
          </div>
        ) : (
          <div className="board-body">
            <div className="min-w-0">
              {mode === "handout" ? <HandOut rows={rows.filter((row) => !phone.has(row.id))} numbers={numbers} me={meData} taskOf={taskOf} onClose={() => setMode("prep")} /> : outline(false)}
              {mode === "handout" ? null : <BoardKeys />}
            </div>
            <aside className="board-aside flex min-w-0 flex-col gap-3">
              <section className="board-wall-card" data-testid="board-wall-card">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold leading-5">Как увидит кабинет</p>
                  <SegmentTabs<BoardView>
                    aria-label="Вид доски на стене"
                    value={wallView}
                    onChange={(view) => {
                      if (onWall) boardControl.mutate({ view });
                      else setPreviewView(view);
                    }}
                    items={BOARD_VIEWS.map((value) => ({ value, label: VIEW_LABEL[value] }))}
                  />
                </div>
                <div className="mt-2.5">
                  <WallPreview data={preview} now={now} rounded={10} />
                </div>
                {wallNote(preview) ? <p className="mt-2 text-[12px] leading-4 text-muted">{wallNote(preview)}</p> : null}
                <p className="mt-2 text-[12px] leading-4 text-muted">
                  {onWall && until ? `На стене до ${tvTime(until)}` : "Пока не на стене"} ·{" "}
                  <button type="button" className="underline underline-offset-2 hover:text-text" onClick={() => setWallOpen(true)}>
                    время и вид
                  </button>
                </p>
              </section>
              <Button size="sm" variant="secondary" icon={<NoteIcon name="note" size={14} />} onClick={() => setPicking(true)} className="self-start" data-testid="board-from-thoughts">
                Добавить из мыслей…
              </Button>
            </aside>
          </div>
        )}
      </div>

      <AssignSheet note={assigning} onClose={() => setAssigning(null)} me={meData} />
      <ThoughtsPicker open={picking} onClose={() => setPicking(false)} notes={notes.data ?? EMPTY} now={now} onAdd={addThought} />
      <BoardPicker {...moves.picker} />
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
          moves.eject();
        }}
      />
      {sketching ? (
        <DeskSketch
          initial={sketching.row ? sketchFrom(sketching.row.sketch) : null}
          caption={sketching.row?.text.trim().split("\n")[0].trim() ?? ""}
          editing={sketching.row !== null}
          onClose={() => setSketching(null)}
          onSave={saveIt}
        />
      ) : null}
    </DeskPage>
  );
}
