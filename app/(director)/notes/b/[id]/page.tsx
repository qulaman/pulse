"use client";

import { onlineManager, useIsMutating } from "@tanstack/react-query";
import { AnimatePresence, MotionConfig, Reorder } from "framer-motion";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { BoardOnWall } from "@/components/mindboard/BoardOnWall";
import { BoardPresenter } from "@/components/mindboard/BoardPresenter";
import { DragRow, useReorder } from "@/components/mindboard/DragRow";
import { PointCard, type PointHandlers, type RowLook } from "@/components/mindboard/PointCard";
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
import { haptic } from "@/lib/haptics";
import { demotedPlace, numbersOf, promotedPlace } from "@/lib/mindboard/branch";
import { boardOnWall, boardSummary, cleanTitle } from "@/lib/mindboard/list";
import { useDeleteBoard, useRenameBoard, useRestoreBoard } from "@/lib/mindboard/mutations";
import { useBoards, type MindBoard } from "@/lib/mindboard/queries";
import { branchesOf, nextPlaceIn } from "@/lib/mindboard/tree";
import { useDictation, type Receipt } from "@/lib/notes/dictation";
import { firstLine, phoneRow, whenRu } from "@/lib/notes/list";
import { useCreateNote, useDeleteNote, useUpdateNote } from "@/lib/notes/mutations";
import type { NoteFields } from "@/lib/notes/pending";
import { useNotes, type Note } from "@/lib/notes/queries";
import { usePendingNotes, useReplayHearing } from "@/lib/notes/replay";
import { useMe, useSentTasks } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
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

const WORDS: RecorderWords = {
  placeholder: "Написать пункт…",
  field: "Новый пункт",
  record: "Диктовать пункт",
  write: "Записать пункт",
};

const quote = (text: string) => {
  const line = firstLine(text);
  return line.length > 28 ? `${line.slice(0, 27).trimEnd()}…` : line;
};

/**
 * A board of «Заметки» (D-102, D-121): a mind map for a short briefing, said one press at a
 * time and shown on the office wall with one tap. The head is the way back, the title (a tap
 * renames it) and «на стену»; the status screen is the dictaphone — every press is the next
 * point, word for word, no parser; below — the branches in the order of the board: a point
 * and its sub-points in one card, opened in place, moved by the handle with its branch. One
 * microphone on the screen: the status screen says points, «+ подпункт» of an open point says
 * sub-points. A line is a note underneath: it waits on the phone without network and lands
 * once (D-95), its voice is kept before any AI (принцип 5). While the board is on the wall the
 * presenter steps through the points and the lit one is marked here too.
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  // «Поручить»: the people sheet over the board, the task leaves from here (D-108)
  const [assigning, setAssigning] = useState<Note | null>(null);
  // the one open sub-point, inside the one open point
  const [openSub, setOpenSub] = useState<{ point: string; sub: string } | null>(null);

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
  const { rows, phoneOnly, waiting } = useMemo(() => {
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
    return {
      rows: [...byId.values()].filter((note) => note.deleted_at === null),
      phoneOnly: phone,
      waiting: new Set([
        ...pending.creates.filter((entry) => entry.boardId === id && late(Date.parse(entry.createdAt))).map((entry) => entry.id),
        ...pending.edits.filter((edit) => late(edit.at)).map((edit) => edit.id),
      ]),
    };
  }, [notes.data, pending, id, online, now]);

  const branches = useMemo(() => branchesOf(rows), [rows]);
  const numbers = useMemo(() => numbersOf(branches), [branches]);
  const natural = useMemo(() => branches.map((branch) => branch.point.id), [branches]);
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  // a point moves by its handle and takes its branch along: one row written, its sub-points follow it
  const order = useReorder(natural, (pointId) => rowById.get(pointId)?.position ?? 0, (pointId, position) => update.mutate({ id: pointId, position }));

  const accordion = useAccordion(natural, { scope: id, autoOpen: false });
  useRevealOpen(accordion.openId, accordion.userTouched);
  const subOpen = openSub && openSub.point === accordion.openId ? openSub.sub : null;

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

  // the wall (D-121): the board on it, and the point the presenter lit
  const onWall = board ? boardOnWall(tv.data, board.id, now) : false;
  const spotRaw = boardPointOf(tv.data ?? null, now);
  const spot = onWall && spotRaw && natural.includes(spotRaw) ? spotRaw : null;

  // the lit point comes into view on the phone too — unless the director is typing
  const shownSpot = useRef<string | null>(null);
  useEffect(() => {
    if (!spot || shownSpot.current === spot) return;
    shownSpot.current = spot;
    const typing = document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement;
    if (typing) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelector<HTMLElement>(`[data-point-id="${spot}"]`)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [spot]);

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

  const summary = boardSummary(rows);
  const until = onWall && tv.data?.board_until ? TIME.format(new Date(tv.data.board_until)) : null;

  const look: RowLook = {
    phone: (rowId) => phoneOnly.has(rowId),
    waiting: (rowId) => waiting.has(rowId),
    hearing: (rowId) => dictation.busy.has(rowId) || hearing.has(rowId),
    task: (row) => (row.converted_task_id ? taskById.get(row.converted_task_id) : undefined),
  };

  const write = (text: string, parentId: string | null) => {
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
  };

  /** A branch changes shape: one row written; the toast offers the way back. */
  const move = (row: Note, to: Pick<NoteFields, "parent_id"> & { position: number }, words: string) => {
    const back = { parent_id: row.parent_id, position: row.position ?? to.position };
    update.mutate({ id: row.id, ...to });
    haptic(10);
    toast(words, { action: { label: "Отменить", onClick: () => update.mutate({ id: row.id, ...back }) } });
  };

  const removeRow = (row: Note) => {
    const kids = rows.filter((child) => child.parent_id === row.id).length;
    const sub = row.parent_id !== null && rowById.has(row.parent_id);
    if (!sub && accordion.openId === row.id) accordion.toggle(row.id);
    haptic(12);
    remove.mutate({
      id: row.id,
      at: new Date().toISOString(),
      words: {
        done: sub ? "Подпункт в корзине" : kids > 0 ? `Пункт и ${kids} ${pluralRu(kids, ["подпункт", "подпункта", "подпунктов"])} в корзине` : "Пункт в корзине",
        undo: "Вернуть",
      },
    });
  };

  const handlersOf = (pointId: string): PointHandlers => {
    const point = rowById.get(pointId) as Note;
    const demoteTo = phoneOnly.has(pointId) ? null : demotedPlace(rows, pointId, (above) => !phoneOnly.has(above));
    const lightable = onWall && point.parent_id === null && point.text.trim() !== "" && !phoneOnly.has(pointId);
    return {
      toggle: () => accordion.toggle(pointId),
      toggleSub: (subId) => {
        haptic(8);
        setOpenSub((current) => (current?.sub === subId ? null : { point: pointId, sub: subId }));
      },
      text: (row, text) => update.mutate({ id: row.id, text }),
      done: (row) => {
        haptic(row.done_at ? 8 : [8, 30, 12]);
        update.mutate({ id: row.id, done_at: row.done_at ? null : new Date().toISOString() });
      },
      assign: (row) => setAssigning(row),
      remove: removeRow,
      retranscribe: (row) => dictation.retranscribe(row),
      write: (text) => write(text, pointId),
      aim: () => aim(pointId),
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
        if (phoneOnly.has(sub.id)) return undefined;
        const to = promotedPlace(rows, sub.id);
        return to ? () => move(sub, to, "Вынес в пункты") : undefined;
      },
      spotlight: lightable
        ? (on) => {
            haptic(8);
            control.mutate(on ? { point: pointId } : { clearPoint: true });
          }
        : undefined,
    };
  };

  // the presenter steps through the points of the agenda that the wall shows
  const presenterPoints = branches
    .filter((branch) => branch.point.parent_id === null && branch.point.text.trim() !== "")
    .map((branch) => ({ id: branch.point.id, text: firstLine(branch.point.text), done: branch.point.done_at !== null }));

  const spotNumber = spot ? numbers.get(spot) : undefined;
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
            {onWall ? (spotNumber ? `На стене сейчас пункт ${spotNumber}` : "Новый пункт сразу на стене") : "Кнопка сверху — доска на стену"}
          </p>
        </div>
      </div>
    );

  return (
    <main className={`mx-auto w-full max-w-lg flex-1 px-4 ${onWall ? "pb-[184px]" : "pb-28"}`}>
      <PageHead
        back={{ href: "/notes?tab=boards", label: "Заметки", testId: "board-back" }}
        smallTitle={board.title}
        tone={onWall ? "accent" : undefined}
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
          onWrite={(text) => write(text, null)}
          onCapture={() => aim(null)}
        />
      </div>

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
          <Reorder.Group as="div" axis="y" values={order.order} onReorder={order.onReorder} className="mt-4 flex flex-col gap-2" data-testid="board-points">
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
                    movable={!phoneOnly.has(pointId) && accordion.openId === null && natural.length > 1}
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
                        open={accordion.openId === pointId}
                        openSub={accordion.openId === pointId ? subOpen : null}
                        lit={spot === pointId}
                        look={look}
                        grip={grip}
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

      {branches.length > 1 ? (
        <p className="mt-2 px-1 text-center text-[12px] leading-4 text-muted">порядок — перетащите пункт за точки справа</p>
      ) : null}

      <div className="mt-8 flex justify-center">
        <Button variant="ghost" size="md" className="!text-danger/80" icon={<NoteIcon name="trash" size={14} />} data-testid="board-delete" onClick={() => setConfirmDelete(true)}>
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

      {/* the presenter (D-121): while the board is on the wall, ◀ ▶ lead the meeting from here */}
      <BoardPresenter variant="board" boardId={board.id} points={presenterPoints} now={now} />
    </main>
  );
}

/**
 * The title of the board as the screen's heading: a tap turns it into a field, Enter or a tap
 * elsewhere keeps the new name, an empty field gives the old one back. A long title shrinks
 * (34 → 26 px) before it wraps, and wraps to three lines at most — up to 120 characters.
 */
function BoardTitle({ title, onRename }: { title: string; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
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
      node.style.lineHeight = "";
      node.style.whiteSpace = "nowrap";
      const natural = node.scrollWidth;
      const width = node.clientWidth;
      node.style.whiteSpace = "";
      if (natural <= width) return;
      const px = Math.max(26, Math.floor((34 * width) / natural));
      node.style.fontSize = `${px}px`;
      if ((natural * px) / 34 > width) node.style.lineHeight = "32px";
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(room);
    return () => resize.disconnect();
  }, [title, editing]);

  // the field is as tall as the title
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [draft, editing]);

  const done = () => {
    setEditing(false);
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
            setEditing(false);
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
        onClick={() => setEditing(true)}
        data-testid="board-title"
        aria-label={`${title} — переименовать`}
        className="line-clamp-3 block w-full text-left"
      >
        {title}
      </button>
    </h1>
  );
}
