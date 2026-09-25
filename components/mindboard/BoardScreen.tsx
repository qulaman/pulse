"use client";

import { AnimatePresence, MotionConfig, Reorder } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { NoteIcon } from "@/components/notes/icons";
import { NotesRecorder, type RecorderWords } from "@/components/notes/NotesRecorder";
import { useAccordion, useRevealOpen } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { PageHead } from "@/components/ui/PageHead";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import { demotedPlace, numbersOf, promotedPlace } from "@/lib/mindboard/branch";
import { boardSummary, cleanTitle } from "@/lib/mindboard/list";
import { waitOf } from "@/lib/mindboard/offline";
import { branchesOf } from "@/lib/mindboard/tree";
import type { Dictation, Receipt } from "@/lib/notes/dictation";
import { firstLine, whenRu } from "@/lib/notes/list";
import type { DeleteWords } from "@/lib/notes/mutations";
import type { NoteFields } from "@/lib/notes/pending";
import type { Note } from "@/lib/notes/queries";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";
import type { PresenterPoint } from "@/lib/tv/presenter";

import { DragRow, useReorder } from "./DragRow";
import { PointCard, type PointHandlers, type RowLook } from "./PointCard";

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

/** The office wall as this board sees it (D-102 §6, D-121). */
export type BoardWall = {
  onWall: boolean;
  /** «21:00» — till when it stays up; null while not on the wall. */
  until: string | null;
  /** The point the presenter lit on the wall; null — none. */
  spot: string | null;
  /** The wall row has been read: a point found lit on arrival is not a step of the meeting. */
  ready: boolean;
};

/** What the screen asks of its data: every write is one call, the page decides how it travels. */
export type BoardActions = {
  /** A point (parentId null) or a sub-point typed under a point: a new line at the end of its list. */
  write: (text: string, parentId: string | null) => void;
  /** Text, a tick, a place, a branch — one row written. */
  edit: (row: Note, fields: NoteFields) => void;
  remove: (row: Note, words: DeleteWords) => void;
  retranscribe: (row: Note) => void;
  /** «Поручить»: the people sheet over the board (the page draws it). */
  assign: (row: Note) => void;
  /** «Показать на стене» — the point, or null to take the light off. */
  spotlight: (pointId: string | null) => void;
  rename: (title: string) => void;
  deleteBoard: () => void;
  /** The screen's one microphone is about to open: for a point (null) or a sub-point of this point. */
  aim: (parentId: string | null) => void;
};

type Props = {
  board: { id: string; title: string };
  lines: BoardLines;
  wall: BoardWall;
  now: Date;
  /** What a handed-over line became. */
  taskOf: (row: Note) => TaskWithPeople | undefined;
  dictation: Dictation;
  /** Whose words the microphone takes now: a point's id — its sub-point; null — a point. */
  aimed: string | null;
  receipt: Receipt | null;
  /** A write of a line is on its way: the status screen's dot breathes. */
  writing: boolean;
  actions: BoardActions;
  /** The round «на стену» of the head. */
  wallButton: ReactNode;
  /** The presenter's capsule over the tab bar, given the points of the agenda (D-121). */
  presenter: (points: PresenterPoint[]) => ReactNode;
  /** Sheets the page draws over the screen («Кому поручить?»). */
  sheets?: ReactNode;
};

/**
 * A board of «Заметки» (D-102, D-121) as a view: a mind map for a short briefing, said one
 * press at a time and shown on the office wall with one tap. The head is the way back, the
 * title (a tap renames it) and «на стену»; the status screen is the dictaphone — every press is
 * the next point, word for word, no parser; below — the branches in the order of the board: a
 * point and its sub-points in one card, opened in place, moved by the handle with its branch,
 * a sub-point moved by its own handle inside its branch. One microphone on the screen: the
 * status screen says points, «+ подпункт» of an open point says sub-points. While the board is
 * on the wall the presenter steps through the points and the lit one is marked here too.
 *
 * Data in, one call per write out: the page (`app/(director)/notes/b/[id]`) feeds it from the
 * cache, the sandbox (`/dev/board`) from fixtures.
 */
export function BoardScreen({ board, lines, wall, now, taskOf, dictation, aimed, receipt, writing, actions, wallButton, presenter, sheets }: Props) {
  const { rows, phone, owed, late, online, hearing } = lines;
  const [confirmDelete, setConfirmDelete] = useState(false);
  // the one open sub-point, inside the one open point
  const [openSub, setOpenSub] = useState<{ point: string; sub: string } | null>(null);

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

  const handlersOf = (pointId: string): PointHandlers => {
    const point = rowById.get(pointId) as Note;
    const demoteTo = phone.has(pointId) ? null : demotedPlace(rows, pointId, (above) => !phone.has(above));
    const lightable = onWall && point.parent_id === null && point.text.trim() !== "" && !phone.has(pointId);
    return {
      toggle: () => accordion.toggle(pointId),
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
      place: (sub, position) => actions.edit(sub, { position }),
      aim: () => actions.aim(pointId),
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
              if (title !== board.title) actions.rename(title);
            }}
          />
        }
        actions={wallButton}
      />

      <div className="mt-3">
        <NotesRecorder
          idle={{
            eyebrow: onWall && until ? `На стене до ${until}` : "Доска",
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
          onCapture={() => actions.aim(null)}
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
                    movable={!phone.has(pointId) && accordion.openId === null && natural.length > 1}
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

      {branches.length > 1 && accordion.openId === null ? (
        <p className="mt-2 px-1 text-center text-[12px] leading-4 text-muted">порядок — перетащите пункт за точки справа</p>
      ) : null}

      <div className="mt-8 flex justify-center">
        <Button variant="ghost" size="md" className="!text-danger/80" icon={<NoteIcon name="trash" size={14} />} data-testid="board-delete" onClick={() => setConfirmDelete(true)}>
          Удалить доску
        </Button>
      </div>

      {sheets}

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

      {/* the presenter (D-121): while the board is on the wall, ◀ ▶ lead the meeting from here */}
      {presenter(presenterPoints)}
    </main>
  );
}

/**
 * The title of the board as the screen's heading: a tap turns it into a field, Enter or a tap
 * elsewhere keeps the new name, an empty field gives the old one back. A long title shrinks
 * (34 → 26 px) and then ends in «…» on its one line, as a large title does on iOS (D-113): the
 * head keeps the height of its skeleton whatever the name (D-122), and the whole name is one
 * tap away — in the field, and on the wall.
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
        className="line-clamp-1 w-full text-left"
      >
        {title}
      </button>
    </h1>
  );
}
