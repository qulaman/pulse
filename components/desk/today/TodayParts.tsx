"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { Fragment, type MouseEvent, type ReactNode } from "react";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import type { MenuItem } from "@/components/desk/ui/Menu";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { When } from "@/components/desk/ui/When";
import { Icon } from "@/components/tasks/desk/icons";
import { CallButton, DraftMark, MiniButton, MoreButton, MoveButton, MoveRow } from "@/components/desk/tasks/RowMoves";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { humanAqtobe } from "@/lib/ai/time";
import type { TeamDayRow } from "@/lib/daily-report/types";
import { attentionLine, decisionLine, decisionParts, type Move } from "@/lib/desk/tasks";
import { shortName } from "@/lib/people/names";
import type { BoardTask } from "@/lib/pulse/board";
import type { AttentionReason } from "@/lib/tasks/attention";
import type { DeskItem } from "@/lib/tasks/desk";
import { isOverdue } from "@/lib/tasks/status-text";

import { BlockLink } from "./home/parts";

/* -------------------------------------------------------------------------- */
/* The left column: the director's work                                         */
/* -------------------------------------------------------------------------- */

/** A list of the work plane: rows under a rule of ink, no box (D-158). */
export function WorkList({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="desk-list" data-testid={testId}>
      {/* a row that came fades in, one that went fades out and the rest close up (D-184) */}
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </div>
  );
}

const ROW_MOVE = { type: "tween", duration: 0.23, ease: [0.2, 0.8, 0.2, 1] } as const;

/**
 * One row of a work list: the whole row opens, its buttons are its own, a right click is its menu.
 * `chosen` — open in the panel; `cursor` — under the keyboard's cursor (J/K). Both read as the
 * table's chosen row (journal.css).
 */
export function WorkRow({
  onOpen,
  onMenu,
  children,
  chosen = false,
  cursor = false,
  twoLines = false,
  testId,
  rowKey,
}: {
  onOpen: () => void;
  onMenu?: (event: MouseEvent) => void;
  children: ReactNode;
  chosen?: boolean;
  cursor?: boolean;
  /** a title and the line under it: 46 px, the rest of the sheet's rows 34 */
  twoLines?: boolean;
  testId?: string;
  rowKey?: string;
}) {
  // a row on its way out is no longer the list's: its key and test id go while it fades
  const present = useIsPresent();
  return (
    <motion.div
      layout="position"
      transition={ROW_MOVE}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.14, ease: "easeIn" } }}
      role="button"
      tabIndex={0}
      data-testid={present ? testId : undefined}
      data-row-key={present ? rowKey : undefined}
      data-cursor={cursor ? "" : undefined}
      aria-current={chosen ? "true" : undefined}
      onClick={(event) => {
        if ((event.target as Element).closest("button, a")) return;
        onOpen();
      }}
      onContextMenu={onMenu}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`desk-row group/row relative flex cursor-pointer flex-col justify-center focus-visible:outline-none ${twoLines ? "py-1" : "py-[3px]"}`}
    >
      {children}
    </motion.div>
  );
}

/**
 * What waits for the director besides tasks (D-133): a disputed minus, an order to hand out. Its
 * moves are the place of decision's own calls, one click each; the row itself goes there — for
 * the words to the person, for «Отменить заказ».
 */
export type ExtraDecision = {
  key: string;
  kind: "dispute" | "order";
  name: string | null | undefined;
  title: string;
  line: string;
  href: string;
  moves: { key: string; label: string; main: boolean; busy: boolean; onPress: () => void }[];
};

/** How many of them stand on the screen before «…ещё N». */
const EXTRAS_SHOWN = 4;

/**
 * The verticals of the left column (D-158): a name, a ring, the words. «Ждут», «Просрочено» and
 * «Команда» share them, so the three blocks read as one sheet.
 */
const ROW_FULL = "grid-cols-[116px_16px_minmax(0,1fr)_auto_28px]";
const ROW_COMPACT = "grid-cols-[116px_16px_minmax(0,1fr)_28px]";
const ROW_LATE = "grid-cols-[116px_16px_minmax(0,1fr)_auto_auto_28px] @max-[640px]:grid-cols-[16px_minmax(0,1fr)_auto_28px]";

/** The moves of a row, the main one last: the pen's words stand on one vertical down the sheet. */
const MOVES = "flex-row-reverse";

/** A row's moves that come over its right end on hover: the panel took the room for them. */
const OVER_ROW = "desk-row-over pointer-events-none absolute inset-y-0 right-8 hidden items-center pl-3 group-hover/row:pointer-events-auto group-hover/row:flex";

/**
 * «Ждут вашего решения» (D-154): hand-ins, requests for time, questions, refusals — the queue's own order,
 * each with who, what, what exactly waits and the reason's two moves at hand. A click opens the
 * task in the panel. The late ones have a list of their own below. Under the tasks — disputes and
 * orders, which have no stack of their own. «Ничего не ждёт» is said only when all of it has
 * really come: `failed` — the queue did not load (the screen says so in the hero's place, so the
 * block stays only for what it does have), `extrasUnknown` — disputes or orders did not.
 */
export function Decisions({
  items,
  limit,
  openId,
  cursorId,
  movesOf,
  onMove,
  onOpen,
  menuOf,
  onMenu,
  compact = false,
  now,
  drafts,
  extras,
  failed,
  extrasNote,
  extrasUnknown,
  watching = false,
}: {
  items: readonly DeskItem[];
  limit: number;
  openId: string | null;
  /** the row under the keyboard's cursor: its letters show on its buttons */
  cursorId: string | null;
  movesOf: (item: DeskItem) => Move[];
  onMove: (move: Move, item: DeskItem, target: HTMLElement) => void;
  onOpen: (id: string) => void;
  /** the row's «⋯» and right click: everything the task allows */
  menuOf: (item: DeskItem) => MenuItem[];
  onMenu: (item: DeskItem, event: MouseEvent) => void;
  /** the panel takes the room: a row's buttons come over its right end on hover, as in the table */
  compact?: boolean;
  now: Date;
  /** the tasks with an answer written and not sent */
  drafts: ReadonlySet<string>;
  extras: readonly ExtraDecision[];
  failed: boolean;
  /** disputes or orders did not load, or are an old copy */
  extrasNote: ReactNode;
  extrasUnknown: boolean;
  /** «Требует внимания» stands below (lib/tasks/attention.ts): an empty queue says nothing then */
  watching?: boolean;
}) {
  const shown = items.slice(0, limit);
  const moreTasks = items.length - shown.length;
  const extrasShown = extras.slice(0, EXTRAS_SHOWN);
  const moreExtras = extras.length - extrasShown.length;
  const nothing = items.length + extras.length === 0;
  if (failed && nothing) return null;
  // nothing to decide, yet something needs the director: no «ничего не ждёт» over it (D-194)
  if (watching && nothing && !extrasUnknown) return null;
  return (
    <section className="@container flex flex-col gap-1" data-testid="today-decisions">
      {/* the same words as the «Ждут вас» tab of «Задачи»; «Разобрать» goes through them one by one (D-160) */}
      <SectionLabel
        count={items.length + extras.length}
        action={
          items.length > 0 ? (
            <span className="flex items-center gap-4">
              <BlockLink href="/desk/inbox">Разобрать по одной</BlockLink>
              <BlockLink href="/desk/tasks?tab=yours">Все в задачах</BlockLink>
            </span>
          ) : null
        }
      >
        Ждут вас
      </SectionLabel>
      {!nothing || extrasUnknown ? null : (
        // the moment above has said that nothing waits: the block only says what will come here (D-194)
        <EmptyState title="Сданная работа, вопросы, просьбы о сроке и отказы встанут сюда" />
      )}
      {nothing ? null : (
        <WorkList testId="today-decisions-list">
          {shown.map((item) => (
            <WorkRow
              key={item.task.id}
              rowKey={item.task.id}
              testId="today-decision"
              twoLines
              chosen={openId === item.task.id}
              cursor={cursorId === item.task.id}
              onOpen={() => onOpen(item.task.id)}
              onMenu={(event) => onMenu(item, event)}
            >
              <div className={`grid items-start gap-x-3 ${compact ? ROW_COMPACT : ROW_FULL}`}>
                <span className="min-w-0" data-act-for={item.task.id} data-act="reassign handoff">
                  <PersonCell name={item.task.assignee?.full_name} />
                </span>
                <span className="mt-0.5">
                  <StatusGlyph status={item.task.status} overdue={isOverdue(item.task, now)} size={16} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate font-medium" title={item.task.title}>
                      {item.task.title}
                    </span>
                    {drafts.has(item.task.id) ? <DraftMark /> : null}
                  </span>
                  <DecisionLine item={item} now={now} />
                </span>
                {compact ? (
                  <span className={OVER_ROW}>
                    <MoveRow className={MOVES} moves={movesOf(item)} onPress={(move, target) => onMove(move, item, target)} showKeys={cursorId === item.task.id} />
                  </span>
                ) : (
                  <MoveRow className={`self-center ${MOVES}`} moves={movesOf(item)} onPress={(move, target) => onMove(move, item, target)} showKeys={cursorId === item.task.id} />
                )}
                <span className="flex self-center">
                  <MoreButton items={() => menuOf(item)} taskId={item.task.id} />
                </span>
              </div>
            </WorkRow>
          ))}
          {moreTasks > 0 ? (
            <Link key="more-tasks" href="/desk/inbox" prefetch className="desk-row flex items-center text-[13px] leading-4 text-muted hover:text-text">
              …ещё {moreTasks} — разобрать по одной
            </Link>
          ) : null}
          {extrasShown.map((extra) => (
            <ExtraRow key={extra.key} extra={extra} compact={compact} />
          ))}
          {moreExtras > 0 ? (
            <Link key="more-extras" href="/desk/settings/points" prefetch className="desk-row flex items-center text-[13px] leading-4 text-muted hover:text-text">
              …ещё {moreExtras} — в «Очках и магазине»
            </Link>
          ) : null}
        </WorkList>
      )}
      {extrasNote}
    </section>
  );
}

/** The grey line of a decision; only a hand-in after the deadline takes the red pencil (D-158: a missed deadline is its one colour). */
function DecisionLine({ item, now }: { item: DeskItem; now: Date }) {
  const text = decisionLine(item.reason, item.task, now);
  return (
    <span className="truncate text-[13px] leading-[18px] text-muted" title={text}>
      {decisionParts(item.reason, item.task, now).map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? " · " : null}
          {part.tone ? (
            <span className="font-medium text-danger" data-testid="today-handin-late">
              {part.text}
            </span>
          ) : (
            part.text
          )}
        </Fragment>
      ))}
    </span>
  );
}

/** A dispute or an order among the decisions: the same row, its own moves, the row leads to where it is decided. */
function ExtraRow({ extra, compact }: { extra: ExtraDecision; compact: boolean }) {
  const router = useRouter();
  const moves = (
    <span className={`flex items-center gap-1 ${MOVES}`}>
      {extra.moves.map((move) => (
        <MiniButton key={move.key} label={move.label} main={move.main} disabled={move.busy} onPress={move.onPress} testId={`today-${extra.kind}-${move.key}`} />
      ))}
    </span>
  );
  return (
    <WorkRow testId={`today-${extra.kind}`} twoLines onOpen={() => router.push(extra.href)}>
      <div className={`grid items-start gap-x-3 ${compact ? ROW_COMPACT : ROW_FULL}`}>
        <PersonCell name={extra.name ?? undefined} />
        <span className="mt-0.5 flex h-4 w-4 items-center justify-center text-warn">
          <Icon name={extra.kind === "dispute" ? "hand" : "check"} size={14} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium" title={extra.title}>
            {extra.title}
          </span>
          <span className="truncate text-[13px] leading-[18px] text-muted" title={extra.line}>
            {extra.line}
          </span>
        </span>
        {compact ? <span className={OVER_ROW}>{moves}</span> : <span className="self-center">{moves}</span>}
        <span />
      </div>
    </WorkRow>
  );
}

/** A task that needs the director without waiting for his decision (lib/tasks/attention.ts). */
export type WatchItem = { task: BoardTask; reason: AttentionReason };

/**
 * «Требует внимания» (D-194): what the verdict holds besides the decisions and the late ones —
 * an order lying untaken for half an hour, a holder whose pushes do not reach, a deadline within the
 * hour. Each row says why in words and offers its one move: «Напомнить» (or when the last reminder
 * went), «Срок»; a push that will not reach has no «Напомнить» — the line asks for a call.
 */
export function Attention({
  items,
  openId,
  moveOf,
  telOf,
  onMove,
  onOpen,
  menuOf,
  onMenu,
  now,
}: {
  items: readonly WatchItem[];
  openId: string | null;
  moveOf: (item: WatchItem) => Move | null;
  /** the holder's number when the push will not reach: «Позвонить» takes the move's place */
  telOf?: (item: WatchItem) => string | null;
  onMove: (move: Move, task: BoardTask, target: HTMLElement) => void;
  onOpen: (id: string) => void;
  menuOf: (task: BoardTask) => MenuItem[];
  onMenu: (task: BoardTask, event: MouseEvent) => void;
  now: Date;
}) {
  if (items.length === 0) return null;
  return (
    <section className="@container flex flex-col gap-1" data-testid="today-attention">
      <SectionLabel count={items.length} action={<BlockLink href="/desk/tasks?tab=working">В задачах</BlockLink>}>
        Требует внимания
      </SectionLabel>
      <WorkList>
        {items.map((item) => {
          const move = moveOf(item);
          const tel = telOf?.(item) ?? null;
          const line = attentionLine(item.reason, item.task, now) ?? "";
          return (
            <WorkRow
              key={item.task.id}
              rowKey={item.task.id}
              testId="today-attention-row"
              chosen={openId === item.task.id}
              cursor={false}
              onOpen={() => onOpen(item.task.id)}
              onMenu={(event) => onMenu(item.task, event)}
            >
              <div className={`grid items-center gap-x-3 ${ROW_LATE}`}>
                <span className="min-w-0 @max-[640px]:hidden">
                  <PersonCell name={item.task.assignee?.full_name} />
                </span>
                <StatusGlyph status={item.task.status} overdue={isOverdue(item.task, now)} size={16} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium" title={item.task.title}>
                    {item.task.title}
                  </span>
                  <span className="hidden truncate text-[13px] leading-[18px] text-muted @max-[640px]:block">
                    {shortName(item.task.assignee?.full_name)} · {line}
                  </span>
                </span>
                <span className="max-w-[300px] truncate text-[13px] text-warn @max-[640px]:hidden" title={line} data-testid="today-attention-line">
                  {line}
                </span>
                {tel ? <CallButton tel={tel} /> : move ? <MoveButton move={move} onPress={(pressed, target) => onMove(pressed, item.task, target)} showKey={false} /> : <span />}
                <MoreButton items={() => menuOf(item.task)} taskId={item.task.id} />
              </div>
            </WorkRow>
          );
        })}
      </WorkList>
    </section>
  );
}

/** «Просрочено» (D-154): every late task with its one move — «Напомнить», or when the last reminder went. */
export function Overdue({
  items,
  openId,
  cursorId,
  movesOf,
  onMove,
  onOpen,
  menuOf,
  onMenu,
  now,
  drafts,
}: {
  items: readonly DeskItem[];
  openId: string | null;
  cursorId: string | null;
  movesOf: (item: DeskItem) => Move[];
  onMove: (move: Move, item: DeskItem, target: HTMLElement) => void;
  onOpen: (id: string) => void;
  menuOf: (item: DeskItem) => MenuItem[];
  onMenu: (item: DeskItem, event: MouseEvent) => void;
  now: Date;
  drafts: ReadonlySet<string>;
}) {
  if (items.length === 0) return null;
  return (
    <section className="@container flex flex-col gap-1" data-testid="today-overdue">
      <SectionLabel count={items.length} action={<BlockLink href="/desk/tasks?tab=yours&due=overdue">В задачах</BlockLink>}>
        Просрочено
      </SectionLabel>
      <WorkList>
        {items.map((item) => {
          const [nudge] = movesOf(item);
          // the block's head says «Просрочено»: a row says by how much
          const late = decisionLine("overdue", { ...item.task, nudged_at: null }, now).replace(/^просрочено на /, "");
          return (
            <WorkRow
              key={item.task.id}
              rowKey={item.task.id}
              testId="today-overdue-row"
              chosen={openId === item.task.id}
              cursor={cursorId === item.task.id}
              onOpen={() => onOpen(item.task.id)}
              onMenu={(event) => onMenu(item, event)}
            >
              {/* on a narrow block the title keeps the row, who and how late go under it */}
              <div className={`grid items-center gap-x-3 ${ROW_LATE}`}>
                <span className="min-w-0 @max-[640px]:hidden">
                  <PersonCell name={item.task.assignee?.full_name} />
                </span>
                <StatusGlyph status={item.task.status} overdue size={16} />
                <span className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate font-medium" title={item.task.title}>
                      {item.task.title}
                    </span>
                    {drafts.has(item.task.id) ? <DraftMark /> : null}
                  </span>
                  <span className="hidden truncate text-[13px] leading-[18px] text-muted @max-[640px]:block" data-act-for={item.task.id} data-act="extend retime">
                    {shortName(item.task.assignee?.full_name)} · <When overdue>{late}</When>
                  </span>
                </span>
                <span className="whitespace-nowrap text-[13px] @max-[640px]:hidden" data-act-for={item.task.id} data-act="extend retime">
                  <When overdue>{late}</When>
                </span>
                {nudge ? <MoveButton move={nudge} onPress={(move, target) => onMove(move, item, target)} showKey={cursorId === item.task.id} /> : <span />}
                <MoreButton items={() => menuOf(item)} taskId={item.task.id} />
              </div>
            </WorkRow>
          );
        })}
      </WorkList>
    </section>
  );
}

/**
 * The day's report of a person in a word: when it came, or that the day closed without it. A
 * report not due yet says nothing here: «Отчёты сегодня» beside it names those still to hand in.
 */
export function reportWord(row: TeamDayRow | undefined, now: Date): string | null {
  if (!row) return null;
  if (row.state === "submitted" && row.report?.submitted_at) return `отчёт ${humanAqtobe(new Date(row.report.submitted_at), now).replace(/^сегодня /, "")}`;
  if (row.state === "missed") return "нет отчёта";
  return null;
}
