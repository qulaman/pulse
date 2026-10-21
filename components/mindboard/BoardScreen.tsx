"use client";

import { AnimatePresence, MotionConfig, Reorder } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { NoteIcon } from "@/components/notes/icons";
import { NotesRecorder, type RecorderWords } from "@/components/notes/NotesRecorder";
import { useAccordion, useRevealOpen } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { HeadButton } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import { demotedPlace, numbersOf, promotedPlace } from "@/lib/mindboard/branch";
import { boardSummary, boardText, cleanTitle, openPoints } from "@/lib/mindboard/list";
import { waitOf } from "@/lib/mindboard/offline";
import { hasContent, isDrawn, nextTurn, pointLabel, sheetOf, sketchFrom, turnOf, withFrame, type Sketch } from "@/lib/mindboard/sketch";
import type { SplitPoint } from "@/lib/mindboard/split";
import { branchesOf } from "@/lib/mindboard/tree";
import type { Dictation, Receipt } from "@/lib/notes/dictation";
import { firstLine, whenRu } from "@/lib/notes/list";
import type { DeleteWords } from "@/lib/notes/mutations";
import type { NoteFields } from "@/lib/notes/pending";
import type { Note } from "@/lib/notes/queries";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import { firstNameOf } from "@/lib/text/normalize";
import { stageOf, type TvBoardData } from "@/lib/tv/board";
import type { PresenterPoint } from "@/lib/tv/presenter";

import { BoardMenu, type BoardMenuItem } from "./BoardMenu";
import { openWords } from "./carry";
import { DragRow, useReorder } from "./DragRow";
import { HandOutBar } from "./HandOutBar";
import { PointCard, type PointHandlers, type RowLook } from "./PointCard";
import { SketchPad } from "./SketchPad";
import { WallPreview } from "./WallPreview";

const WORDS: RecorderWords = {
  placeholder: "Написать пункт…",
  field: "Новый пункт",
  record: "Диктовать пункт",
  write: "Записать пункт",
};

/** The lines of the board as the director should see them, and how each is doing on its way. */
export type BoardLines = {
  /** Live lines of this board: the cache, edits still on the phone laid over, lines only on the phone. */
  rows: Note[];
  /** Exist only on the phone so far: nothing to edit or move until they land. */
  phone: ReadonlySet<string>;
  /** Created on the phone and not on the server yet (in the cache or not). */
  owed: ReadonlySet<string>;
  /** Something of the line is owed and has waited too long — or there is no network. */
  late: ReadonlySet<string>;
  online: boolean;
  /** Their words are on the way from STT right now. */
  hearing: ReadonlySet<string>;
};

/** The office wall as this board sees it (D-102 §6, D-121, D-140). */
export type BoardWall = {
  onWall: boolean;
  /** «21:00» — till when it stays up; null while not on the wall. */
  until: string | null;
  /** The point the presenter lit on the wall; null — none. */
  spot: string | null;
  /** The wall row has been read: a point found lit on arrival is not a step of the meeting. */
  ready: boolean;
  /** The board as the wall will draw it (D-140) — the preview; null while there is nothing to draw. */
  preview: TvBoardData | null;
};

/** A person picked for a point (D-108). */
export type Person = { id: string; full_name: string };

/**
 * Whose words the screen's one microphone takes (D-121, D-140): null — a point at the
 * bottom (the status screen), `sub:<point>` — a sub-point of that point, `after:<point>` — a
 * point right after it.
 */
export type AimKey = string | null;

/** What the screen asks of its data: every write is one call, the page decides how it travels. */
export type BoardActions = {
  /** A point (parentId null) or a sub-point typed under a point: a new line at the end of its list. */
  write: (text: string, parentId: string | null) => void;
  /** «Рисунок» (D-141): a drawing from the pad, a new point at the end of the board, its words optional. */
  writeSketch: (sketch: Sketch, caption: string) => void;
  /**
   * Several lines at once (D-140): a list split into points with their sub-points — at the
   * bottom, right after a point (`after`), or as sub-points of a point (`parent`).
   */
  writeMany: (points: SplitPoint[], at: { parent?: string; after?: string }) => void;
  /** Text, a tick, a place, a branch — one row written. */
  edit: (row: Note, fields: NoteFields) => void;
  remove: (row: Note, words: DeleteWords) => void;
  retranscribe: (row: Note) => void;
  /** «Поручить»: the people sheet over the board (the page draws it). */
  assign: (row: Note) => void;
  /** «Показать на стене» — the point, or null to take the light off. */
  spotlight: (pointId: string | null) => void;
  /** «Во весь экран» of a drawing while the board is not on the wall (D-141): the board goes up, the drawing lit. */
  showSketch: (pointId: string) => void;
  /** «Дела исполнителя на стене» of a handed point (D-144): the person's focus on the wall. */
  showPerson: (employeeId: string, name: string | null) => void;
  rename: (title: string) => void;
  deleteBoard: () => void;
  /** The screen's one microphone is about to open for this target. */
  aim: (key: AimKey) => void;
  /** «Закрепить» / «Открепить» (D-140). */
  pin: (on: boolean) => void;
  /** «Завершить доску» / «Вернуть в работу» (D-140). */
  finish: (on: boolean) => void;
  /** «Новая доска из открытых» (D-140). */
  copyOpen: () => void;
  /** «На другую доску» of a point: the boards sheet (the page draws it). */
  move: (row: Note) => void;
  /** «Как на стене»: the wall's sheet (the page draws it). */
  openWall: () => void;
  /** «Раздать поручения»: whom this point goes to — the people sheet, then `then`. */
  pickPerson: (row: Note, then: (person: Person) => void) => void;
  /** Sends the picked points as tasks (`key` — the pick's idempotency key); resolves with the points that did not go. */
  assignMany: (picks: { row: Note; person: Person; key: string }[], forceNow: boolean) => Promise<string[]>;
};

type Props = {
  board: { id: string; title: string; pinned_at: string | null; finished_at: string | null };
  lines: BoardLines;
  wall: BoardWall;
  now: Date;
  /** What a handed-over line became. */
  taskOf: (row: Note) => TaskWithPeople | undefined;
  dictation: Dictation;
  /** Whose words the microphone takes now (`AimKey`). */
  aimed: AimKey;
  receipt: Receipt | null;
  /** A write of a line is on its way: the status screen's dot breathes. */
  writing: boolean;
  actions: BoardActions;
  /** The round «на стену» of the head. */
  wallButton: ReactNode;
  /** The presenter's capsule over the tab bar, given the points of the agenda (D-121). */
  presenter: (points: PresenterPoint[]) => ReactNode;
  /** Outside the delivery window: when handed-out tasks reach people («утром в 08:00»); null — now. */
  quiet: string | null;
  /** Sheets the page draws over the screen («Кому поручить?», «Как на стене», «На какую доску?»). */
  sheets?: ReactNode;
};

/**
 * A board of «Заметки» (D-102, D-121, D-140) as a view: a mind map for a short briefing, said
 * one press at a time and shown on the office wall with one tap. The head is the way back, the
 * title (a tap renames it), «⋯» with everything else a board can do, and «на стену»; the status
 * screen is the dictaphone — every press is the next point, word for word, no parser, and a
 * typed or pasted list splits into points; under it the wall in miniature — what the office
 * will see; below — the branches in the order of the board: a point and its sub-points in one
 * card, opened in place, moved by the handle with its branch, a sub-point moved by its own
 * handle inside its branch. One microphone on the screen: the status screen says points at
 * the bottom, «+ подпункт» of an open point says its sub-points, «Пункт ниже» says a point
 * right after it. While the board is on the wall the presenter steps through the points and
 * the lit one is marked here too; «Раздать поручения» turns the cards into picks of people.
 *
 * Data in, one call per write out: the page (`app/(director)/notes/b/[id]`) feeds it from the
 * cache, the sandbox (`/dev/board`) from fixtures.
 */
export function BoardScreen({ board, lines, wall, now, taskOf, dictation, aimed, receipt, writing, actions, wallButton, presenter, quiet, sheets }: Props) {
  const { rows, phone, owed, late, online, hearing } = lines;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // «Раздать поручения» (D-140): the person picked for each point, with the pick's own key —
  // a retry of what did not go sends the same key; null — not handing out
  const [handing, setHanding] = useState<Map<string, { person: Person; key: string }> | null>(null);
  const [handNow, setHandNow] = useState(false);
  const [sending, setSending] = useState(false);
  // the one open sub-point, inside the one open point
  const [openSub, setOpenSub] = useState<{ point: string; sub: string } | null>(null);
  // «Рисунок» (D-141): the pad over the screen — a new drawing (row null) or this point's
  const [sketching, setSketching] = useState<{ row: Note | null } | null>(null);

  const branches = useMemo(() => branchesOf(rows), [rows]);
  const numbers = useMemo(() => numbersOf(branches), [branches]);
  const natural = useMemo(() => branches.map((branch) => branch.point.id), [branches]);
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  // a point moves by its handle and takes its branch along: one row written, its sub-points follow it
  const order = useReorder(
    natural,
    (pointId) => rowById.get(pointId)?.position ?? 0,
    (pointId, position) => {
      const row = rowById.get(pointId);
      if (row) actions.edit(row, { position });
    },
  );

  const accordion = useAccordion(natural, { scope: board.id, autoOpen: false });
  useRevealOpen(accordion.openId, accordion.userTouched);
  const subOpen = openSub && openSub.point === accordion.openId ? openSub.sub : null;

  const { onWall, until, spot: spotRaw, ready } = wall;
  const spot = onWall && spotRaw && natural.includes(spotRaw) ? spotRaw : null;

  // a step of the meeting brings the lit point into view on the phone too — unless the director
  // is typing. The point already lit when the screen opens is not a step: the screen does not
  // jump on arrival (D-122); the capsule's words take the eye there on a tap.
  const shownSpot = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    if (shownSpot.current === undefined) {
      shownSpot.current = spot;
      return;
    }
    if (!spot || shownSpot.current === spot) return;
    shownSpot.current = spot;
    const typing = document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement;
    if (typing) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // the card itself: its scroll margins keep it clear of the head and of the capsule over the tab bar
    document.querySelector<HTMLElement>(`article[data-task-id="${spot}"]`)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [spot, ready]);

  const summary = boardSummary(rows);
  const open = useMemo(() => openPoints(rows.filter((row) => !phone.has(row.id))), [rows, phone]);
  // what «Раздать поручения» can hand: points with words, no task yet, on the server
  const handable = useMemo(
    () => new Set(branches.map((branch) => branch.point).filter((point) => point.text.trim() && point.converted_task_id === null && !phone.has(point.id)).map((point) => point.id)),
    [branches, phone],
  );

  const look: RowLook = {
    phone: (rowId) => phone.has(rowId),
    wait: (row) => waitOf(row, { late: (rowId) => late.has(rowId), owed: (rowId) => owed.has(rowId), phone: (rowId) => phone.has(rowId), online }),
    hearing: (rowId) => hearing.has(rowId),
    task: taskOf,
  };

  /** A branch changes shape: one row written; the toast offers the way back. */
  const move = (row: Note, to: Pick<NoteFields, "parent_id"> & { position: number }, words: string) => {
    const back = { parent_id: row.parent_id, position: row.position ?? to.position };
    actions.edit(row, to);
    haptic(10);
    toast(words, { action: { label: "Отменить", onClick: () => actions.edit(row, back) } });
  };

  const removeRow = (row: Note) => {
    const kids = rows.filter((child) => child.parent_id === row.id).length;
    const sub = row.parent_id !== null && rowById.has(row.parent_id);
    if (!sub && accordion.openId === row.id) accordion.toggle(row.id);
    haptic(12);
    actions.remove(row, {
      done: sub ? "Подпункт в корзине" : kids > 0 ? `Пункт и ${kids} ${pluralRu(kids, ["подпункт", "подпункта", "подпунктов"])} в корзине` : "Пункт в корзине",
      undo: "Вернуть",
    });
  };

  const pickFor = (point: Note) => {
    if (!handing) return;
    if (!handable.has(point.id)) {
      toast(point.converted_task_id ? "Этот пункт уже поручен" : !point.text.trim() ? "Пункт без слов — поручать пока нечего" : "Пункт ещё на телефоне — поручить можно, когда доедет");
      return;
    }
    actions.pickPerson(point, (person) => {
      haptic(8);
      setHanding((was) => (was ? new Map(was).set(point.id, { person, key: crypto.randomUUID() }) : was));
    });
  };

  // a handed point's person on the wall (D-144): only while the task is under way — the one who
  // declined is not put up beside the line the wall leaves without a stage (D-45)
  const personOf = (task: TaskWithPeople | undefined) =>
    task && stageOf(task.status) !== null && task.assignee_id
      ? () => {
          haptic(8);
          actions.showPerson(task.assignee_id, firstNameOf(task.assignee?.full_name) || null);
        }
      : undefined;

  const handlersOf = (pointId: string): PointHandlers => {
    const point = rowById.get(pointId) as Note;
    // a drawing stays a point: a sub-point has no room for its picture (D-141)
    const demoteTo = phone.has(pointId) || isDrawn(point.sketch) ? null : demotedPlace(rows, pointId, (above) => !phone.has(above));
    const lightable = onWall && point.parent_id === null && hasContent(point) && !phone.has(pointId);
    // a drawing goes over the whole wall from its card even while the board is not up (D-141)
    const drawing = point.parent_id === null && !phone.has(pointId) && isDrawn(point.sketch);
    return {
      toggle: () => (handing ? pickFor(point) : accordion.toggle(pointId)),
      toggleSub: (subId) => {
        haptic(8);
        setOpenSub((current) => (current?.sub === subId ? null : { point: pointId, sub: subId }));
      },
      text: (row, text) => actions.edit(row, { text }),
      done: (row) => {
        haptic(row.done_at ? 8 : [8, 30, 12]);
        actions.edit(row, { done_at: row.done_at ? null : new Date().toISOString() });
      },
      assign: actions.assign,
      remove: removeRow,
      retranscribe: actions.retranscribe,
      write: (text) => actions.write(text, pointId),
      writeMany: (texts) => actions.writeMany([{ text: "", children: texts }], { parent: pointId }),
      writeAfter: (texts) => actions.writeMany(texts.map((text) => ({ text, children: [] })), { after: pointId }),
      aimAfter: () => actions.aim(`after:${pointId}`),
      move: phone.has(pointId) || point.parent_id !== null ? undefined : () => actions.move(point),
      sketch: () => setSketching({ row: point }),
      turnSketch: () => {
        const sketch = sketchFrom(point.sketch);
        if (!sketch) return;
        haptic(8);
        actions.edit(point, { sketch: withFrame(sketch, sheetOf(sketch), nextTurn(turnOf(sketch))) });
      },
      place: (sub, position) => actions.edit(sub, { position }),
      aim: () => actions.aim(`sub:${pointId}`),
      demote: demoteTo
        ? () => {
            const n = numbers.get(demoteTo.parent_id);
            move(point, demoteTo, n ? `Теперь подпункт пункта ${n}` : "Теперь подпункт");
            // the eye follows the line to its new point, opened with it inside
            accordion.focus(demoteTo.parent_id);
            setOpenSub({ point: demoteTo.parent_id, sub: pointId });
          }
        : undefined,
      promote: (sub) => {
        if (phone.has(sub.id)) return undefined;
        const to = promotedPlace(rows, sub.id);
        return to ? () => move(sub, to, "Вынес в пункты") : undefined;
      },
      spotlight: lightable
        ? (on) => {
            haptic(8);
            actions.spotlight(on ? pointId : null);
          }
        : undefined,
      showPerson: personOf(look.task(point)),
      showSketch:
        drawing && !onWall
          ? () => {
              haptic(8);
              actions.showSketch(pointId);
            }
          : undefined,
    };
  };

  // the presenter steps through the points of the agenda that the wall shows
  const presenterPoints = branches
    .filter((branch) => branch.point.parent_id === null && hasContent(branch.point))
    .map((branch) => ({ id: branch.point.id, text: firstLine(pointLabel(branch.point.text, branch.point.sketch)), done: branch.point.done_at !== null }));

  const saveSketch = (sketch: Sketch | null, caption: string) => {
    const row = sketching?.row ?? null;
    setSketching(null);
    if (!row) {
      if (sketch) actions.writeSketch(sketch, caption);
      else if (caption) actions.write(caption, null);
      return;
    }
    // the pad edits the first line; the rest of a point of several lines stays as it was
    const [first = "", ...rest] = row.text.trim().split("\n");
    const text = caption === first.trim() ? null : [caption, ...rest].join("\n").trim();
    actions.edit(row, { sketch, ...(text === null ? {} : { text }) });
    toast(sketch ? "Рисунок сохранён" : "Рисунок стёрт — пункт остался");
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
    const ticked = rows.filter((row) => row.done_at !== null && !phone.has(row.id));
    if (ticked.length === 0) return;
    for (const row of ticked) actions.edit(row, { done_at: null });
    haptic(10);
    toast(`Снял ${ticked.length} ${pluralRu(ticked.length, ["отметку", "отметки", "отметок"])}`, {
      action: { label: "Вернуть", onClick: () => ticked.forEach((row) => actions.edit(row, { done_at: row.done_at })) },
    });
  };

  const startHanding = () => {
    if (accordion.openId) accordion.toggle(accordion.openId);
    setHandNow(false);
    setHanding(new Map());
  };

  const sendHanding = async () => {
    if (!handing || handing.size === 0) return;
    const picks = [...handing].flatMap(([id, pick]) => {
      const row = rowById.get(id);
      return row ? [{ row, person: pick.person, key: pick.key }] : [];
    });
    setSending(true);
    let failed: string[];
    try {
      failed = await actions.assignMany(picks, handNow);
    } catch {
      failed = picks.map((pick) => pick.row.id);
      toast("Не получилось поручить. Попробуйте ещё раз");
    } finally {
      setSending(false);
    }
    // what went is a task now; what did not stays picked for the next tap
    if (failed.length === 0) setHanding(null);
    else setHanding(new Map(picks.filter((pick) => failed.includes(pick.row.id)).map((pick) => [pick.row.id, { person: pick.person, key: pick.key }])));
  };

  // every tick on the board, sub-points too: what «Снять все отметки» will take off
  const ticks = rows.filter((row) => row.done_at !== null && !phone.has(row.id)).length;
  const menuItems: BoardMenuItem[] = [
    { key: "rename", label: "Переименовать", icon: "pencil", run: () => setRenaming(true) },
    { key: "pin", label: board.pinned_at ? "Открепить" : "Закрепить сверху", icon: "pin", run: () => actions.pin(!board.pinned_at) },
    ...(handable.size > 0 ? [{ key: "hand", label: "Раздать поручения", detail: "кому какой пункт — и одним тапом", icon: "task" as const, run: startHanding }] : []),
    ...(open.length > 0 ? [{ key: "copy", label: "Новая доска из открытых", detail: `${openWords(open.length)} — на следующую встречу`, icon: "stack" as const, run: actions.copyOpen }] : []),
    ...(ticks > 0 ? [{ key: "untick", label: "Снять все отметки", detail: `${ticks} ${pluralRu(ticks, ["отметка", "отметки", "отметок"])}`, icon: "retry" as const, run: untickAll }] : []),
    ...(summary.total > 0 ? [{ key: "text", label: "Скопировать текстом", detail: "пункты по номерам — для мессенджера", icon: "copy" as const, run: () => void copyText() }] : []),
    board.finished_at
      ? { key: "finish", label: "Вернуть в работу", icon: "restore", run: () => actions.finish(false) }
      : { key: "finish", label: "Завершить доску", detail: "уйдёт в «Завершённые», целиком", icon: "flag", run: () => actions.finish(true) },
    { key: "delete", label: "Удалить доску", icon: "trash", danger: true, sheet: true, run: () => setConfirmDelete(true) },
  ];

  const spotNumber = spot ? numbers.get(spot) : undefined;
  const idleBody =
    summary.total === 0 ? (
      <div className="flex h-full flex-col justify-center">
        <p className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.015em]">Пока пусто</p>
        <p className="mt-0.5 text-[13px] leading-[18px] text-muted">Зажмите микрофон и скажите первый пункт — или вставьте список, разобью на пункты</p>
      </div>
    ) : (
      <div className="flex h-full items-center gap-3.5">
        <span data-testid="board-headline" className="nums shrink-0 text-[48px] font-bold leading-[48px] tracking-[-0.04em]" style={{ color: "var(--accent)" }}>
          {summary.total}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[17px] font-semibold leading-[22px] tracking-[-0.015em]" data-testid="board-summary">
            {pluralRu(summary.total, ["пункт", "пункта", "пунктов"])}
            {summary.subs > 0 ? ` · ${summary.subs} ${pluralRu(summary.subs, ["подпункт", "подпункта", "подпунктов"])}` : ""}
          </p>
          <p className="mt-0.5 truncate text-[13px] leading-[18px] text-muted">
            {[summary.done > 0 ? `${summary.done} ${pluralRu(summary.done, ["отмечен", "отмечено", "отмечено"])}` : "", summary.lastAt ? `последний ${whenRu(summary.lastAt, now)}` : ""]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="truncate text-[13px] leading-[18px] text-muted">
            {board.finished_at
              ? "Совещание завершено — доска целая"
              : onWall
                ? spotNumber
                  ? `На стене сейчас пункт ${spotNumber}`
                  : "Новый пункт сразу на стене"
                : "Кнопка сверху — доска на стену"}
          </p>
        </div>
      </div>
    );

  return (
    <main className={`mx-auto w-full max-w-lg flex-1 px-4 ${onWall || handing ? "pb-[184px]" : "pb-28"}`}>
      <PageHead
        back={{ href: "/notes?tab=boards", label: "Заметки", testId: "board-back" }}
        smallTitle={board.title}
        tone={onWall ? "accent" : undefined}
        heading={
          <BoardTitle
            key={board.title}
            title={board.title}
            editing={renaming}
            onEditing={setRenaming}
            onRename={(title) => {
              if (title !== board.title) actions.rename(title);
            }}
          />
        }
        actions={
          <>
            <HeadButton label="Все действия с доской" icon="more" testId="board-more" onClick={() => setMenu(true)} />
            {wallButton}
          </>
        }
      />

      <div className="mt-3">
        <NotesRecorder
          idle={{
            eyebrow: board.finished_at ? "Завершена" : onWall && until ? `На стене до ${until}` : board.pinned_at ? "Доска · закреплена" : "Доска",
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
          onWrite={(text) => actions.write(text, null)}
          onSplit={(points) => actions.writeMany(points, {})}
          onSketch={() => setSketching({ row: null })}
          onCapture={() => actions.aim(null)}
        />
      </div>

      {wall.preview ? <WallCard data={wall.preview} now={now} onWall={onWall} until={until} onOpen={actions.openWall} /> : null}

      {branches.length === 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-[18px] border border-dashed border-border px-3.5 py-4" data-testid="board-empty">
          <span aria-hidden className="nums mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-dashed border-accent/60 text-[12px] font-bold text-accent">
            1
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[16px] font-semibold leading-[21px]">Здесь встанет первый пункт</span>
            <span className="mt-1 block text-[14px] leading-[19px] text-muted">Скажите его в микрофон или напишите. Подробности — подпунктами: откройте пункт и добавьте.</span>
          </span>
        </div>
      ) : (
        <MotionConfig reducedMotion="user">
          {handing ? (
            <p className="mt-4 px-1 text-[13px] leading-[18px] text-muted" data-testid="hand-out-hint">
              Тап по пункту — кому его поручить. Потом «Поручить» внизу — уйдут все сразу
            </p>
          ) : null}
          <Reorder.Group as="div" axis="y" values={order.order} onReorder={order.onReorder} className={`${handing ? "mt-2" : "mt-4"} flex flex-col gap-2`} data-testid="board-points">
            <AnimatePresence initial={false} mode="popLayout">
              {order.order.map((pointId) => {
                const branch = branches.find((item) => item.point.id === pointId);
                if (!branch) return null;
                const n = numbers.get(pointId) ?? null;
                const at = natural.indexOf(pointId);
                const above = at > 0 ? branches[at - 1].point : null;
                const aboveN = above ? numbers.get(above.id) : undefined;
                return (
                  <DragRow
                    key={pointId}
                    id={pointId}
                    movable={!handing && !phone.has(pointId) && accordion.openId === null && natural.length > 1}
                    label={n ? `Перетащить пункт ${n}` : "Перетащить пункт"}
                    onStart={order.start}
                    onEnd={() => order.drop(pointId)}
                  >
                    {(grip) => (
                      <PointCard
                        branch={branch}
                        n={n}
                        demoteLabel={aboveN ? `пункта ${aboveN}` : "пункта выше"}
                        now={now}
                        open={!handing && accordion.openId === pointId}
                        openSub={!handing && accordion.openId === pointId ? subOpen : null}
                        lit={spot === pointId}
                        hand={handing ? { person: firstNameOf(handing.get(pointId)?.person.full_name) || null, can: handable.has(pointId) } : undefined}
                        look={look}
                        grip={handing ? undefined : grip}
                        dictation={dictation}
                        aimed={aimed}
                        on={handlersOf(pointId)}
                      />
                    )}
                  </DragRow>
                );
              })}
            </AnimatePresence>
          </Reorder.Group>
        </MotionConfig>
      )}

      {branches.length > 1 && accordion.openId === null && !handing ? (
        <p className="mt-2 px-1 text-center text-[12px] leading-4 text-muted">порядок — перетащите пункт за точки справа</p>
      ) : null}

      {sheets}

      <BoardMenu open={menu} onClose={() => setMenu(false)} title={board.title} items={menuItems} />

      {sketching ? (
        <SketchPad
          initial={sketching.row ? sketchFrom(sketching.row.sketch) : null}
          caption={sketching.row?.text.trim().split("\n")[0].trim() ?? ""}
          editing={sketching.row !== null}
          onClose={() => setSketching(null)}
          onSave={saveSketch}
        />
      ) : null}

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
              actions.deleteBoard();
            }}
          >
            Удалить
          </Button>
          <Button variant="secondary" block onClick={() => setConfirmDelete(false)}>
            Не сейчас
          </Button>
        </div>
      </Sheet>

      {/* the presenter (D-121): while the board is on the wall, ◀ ▶ lead the meeting from here;
          handing out (D-140) takes its place over the tab bar */}
      {handing ? (
        <HandOutBar
          picked={handing.size}
          busy={sending}
          quiet={quiet}
          now={handNow}
          onQuiet={() => setHandNow((was) => !was)}
          onSend={() => void sendHanding()}
          onCancel={() => setHanding(null)}
        />
      ) : (
        presenter(presenterPoints)
      )}
    </main>
  );
}

/**
 * The wall in miniature under the status screen (D-140): what the office sees, or will see —
 * a tap opens it large with «Список / Карта» and the time on the wall.
 */
function WallCard({ data, now, onWall, until, onOpen }: { data: TvBoardData; now: Date; onWall: boolean; until: string | null; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="wall-card"
      className="task-card mt-2 flex w-full items-center gap-3 rounded-[18px] p-2.5 pr-3.5 text-left transition-transform duration-[120ms] active:scale-[0.99]"
    >
      <span className="w-[112px] shrink-0">
        <WallPreview data={data} now={now} rounded={9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-display text-[15px] font-semibold leading-[20px] ${onWall ? "text-accent" : ""}`}>{onWall ? "Сейчас на стене" : "Как на стене"}</span>
        <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-muted">
          {[data.view === "map" ? "карта" : "список", onWall && until ? `до ${until}` : "вид и время показа"].join(" · ")}
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-muted/70">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5.5 15.5 12 9 18.5" />
        </svg>
      </span>
    </button>
  );
}

/**
 * The title of the board as the screen's heading: a tap turns it into a field (so does
 * «Переименовать» of «⋯»), Enter or a tap elsewhere keeps the new name, an empty field gives
 * the old one back. A long title shrinks (34 → 26 px) and then ends in «…» on its one line,
 * as a large title does on iOS (D-113): the head keeps the height of its skeleton whatever
 * the name (D-122), and the whole name is one tap away — in the field, and on the wall.
 */
function BoardTitle({
  title,
  editing,
  onEditing,
  onRename,
}: {
  title: string;
  editing: boolean;
  onEditing: (on: boolean) => void;
  onRename: (title: string) => void;
}) {
  const [draft, setDraft] = useState(title);
  const text = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  // measured before paint, like the screen head's own title: nothing under it moves
  useLayoutEffect(() => {
    const node = text.current;
    const room = node?.parentElement;
    if (!node || !room) return;
    const fit = () => {
      node.style.fontSize = "";
      node.style.whiteSpace = "nowrap";
      // scrollWidth is rounded: a line that measures «376 of 376» may need 376.4 px and wrap
      const natural = node.scrollWidth + 1;
      const width = node.clientWidth;
      node.style.whiteSpace = "";
      if (natural <= width) return;
      node.style.fontSize = `${Math.max(26, Math.floor((34 * width) / natural))}px`;
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(room);
    // on a hard load the first measure may take the fallback face: measure again with the title's own
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) fit();
    });
    return () => {
      alive = false;
      resize.disconnect();
    };
  }, [title, editing]);

  // the field is as tall as the title
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [draft, editing]);

  const done = () => {
    onEditing(false);
    const next = cleanTitle(draft, title);
    setDraft(next);
    onRename(next);
  };

  if (editing) {
    return (
      <textarea
        ref={field}
        autoFocus
        rows={1}
        value={draft}
        maxLength={120}
        onChange={(event) => setDraft(event.target.value.replace(/\n/g, " "))}
        onBlur={done}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            done();
          }
          if (event.key === "Escape") {
            setDraft(title);
            onEditing(false);
          }
        }}
        enterKeyHint="done"
        aria-label="Название доски"
        data-testid="board-title-input"
        className="-ml-2 mt-px block w-[calc(100%+16px)] resize-none rounded-[10px] bg-surface-2/60 px-2 font-display text-[26px] font-bold leading-[32px] tracking-[-0.025em] outline-none"
      />
    );
  }
  // the screen's large title (D-113): the same face, a tap renames
  return (
    <h1 className="page-head-title">
      <button
        ref={text}
        type="button"
        onClick={() => onEditing(true)}
        data-testid="board-title"
        aria-label={`${title} — переименовать`}
        className="line-clamp-1 w-full text-left"
      >
        {title}
      </button>
    </h1>
  );
}
