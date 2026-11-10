"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, type MouseEvent, type ReactNode } from "react";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import type { MenuItem } from "@/components/desk/ui/Menu";
import { Num } from "@/components/desk/ui/Num";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { QuickErrands } from "@/components/desk/ui/QuickErrands";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import type { Tone } from "@/components/desk/ui/tone";
import { When } from "@/components/desk/ui/When";
import { Icon } from "@/components/tasks/desk/icons";
import { DraftMark, MiniButton, MoreButton, MoveButton, MoveRow } from "@/components/desk/tasks/RowMoves";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { isOver, nextEvent, peopleCount, timeRange, ymdOfEvent } from "@/lib/calendar/agenda";
import { isRunning } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import type { TeamDay, TeamDayRow } from "@/lib/daily-report/types";
import { todayYmd } from "@/lib/datetime/calendar";
import { decisionLine, decisionParts, type Move } from "@/lib/desk/tasks";
import { ERRAND_STATUS_WORD, waitedFor, type Errand } from "@/lib/errands/queries";
import { shortName } from "@/lib/people/names";
import type { DeskItem } from "@/lib/tasks/desk";
import { pluralRu, isOverdue } from "@/lib/tasks/status-text";
import { lineOf, type TvEvent } from "@/lib/tv/feed";
import type { Visit, VisitAnswer } from "@/lib/visits/queries";
import { waitedSince } from "@/lib/visits/text";

/* -------------------------------------------------------------------------- */
/* The left column: the director's work                                         */
/* -------------------------------------------------------------------------- */

/** A list of the work plane: rows under a rule of ink, no box (D-158). */
export function WorkList({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="desk-list" data-testid={testId}>
      {children}
    </div>
  );
}

/** A way from a block's head to the screen that holds all of it. */
function BlockLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch className="text-[13px] leading-4 text-muted transition-colors hover:text-text">
      {children}
    </Link>
  );
}

/**
 * One row of a work list: the whole row opens, its buttons are its own, a right click is its menu.
 * `chosen` — open in the panel; `cursor` — under the keyboard's cursor (J/K). Both read as the
 * table's chosen row (journal.css).
 */
function WorkRow({
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
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={testId}
      data-row-key={rowKey}
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
    </div>
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
const ROW_TEAM = "grid-cols-[116px_16px_minmax(0,1fr)_84px_16px] @min-[760px]:grid-cols-[116px_16px_minmax(0,1fr)_96px_116px]";

/** The moves of a row, the main one last: the pen's words stand on one vertical down the sheet. */
const MOVES = "flex-row-reverse";

/** A row's moves that come over its right end on hover: the panel took the room for them. */
const OVER_ROW = "desk-row-over pointer-events-none absolute inset-y-0 right-8 hidden items-center pl-3 group-hover/row:pointer-events-auto group-hover/row:flex";

/**
 * «Ждут вашего решения» (D-154): приёмка, просьбы о сроке, вопросы, отказы — the queue's own order,
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
}) {
  const shown = items.slice(0, limit);
  const moreTasks = items.length - shown.length;
  const extrasShown = extras.slice(0, EXTRAS_SHOWN);
  const moreExtras = extras.length - extrasShown.length;
  const nothing = items.length + extras.length === 0;
  if (failed && nothing) return null;
  return (
    <section className="@container flex flex-col gap-1" data-testid="today-decisions">
      {/* the same words as the «Ждут вас» tab of «Задачи»; «Разобрать» goes through them one by one (D-160) */}
      <SectionLabel
        count={items.length + extras.length}
        action={
          items.length > 0 ? (
            <span className="flex items-center gap-4">
              <BlockLink href="/desk/inbox">Разобрать по одной →</BlockLink>
              <BlockLink href="/desk/tasks?tab=yours">Все в задачах →</BlockLink>
            </span>
          ) : null
        }
      >
        Ждут вас
      </SectionLabel>
      {!nothing || extrasUnknown ? null : (
        <EmptyState tone="ok" title="Ваших решений ничего не ждёт" hint="Сданная работа, вопросы, просьбы о сроке и отказы встанут сюда — с кнопками под рукой" />
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
                  <MoreButton items={() => menuOf(item)} />
                </span>
              </div>
            </WorkRow>
          ))}
          {moreTasks > 0 ? (
            <Link href="/desk/inbox" prefetch className="desk-row flex items-center text-[13px] leading-4 text-muted hover:text-text">
              …ещё {moreTasks} — разобрать по одной
            </Link>
          ) : null}
          {extrasShown.map((extra) => (
            <ExtraRow key={extra.key} extra={extra} compact={compact} />
          ))}
          {moreExtras > 0 ? (
            <Link href="/desk/settings/points" prefetch className="desk-row flex items-center text-[13px] leading-4 text-muted hover:text-text">
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
      <SectionLabel count={items.length} action={<BlockLink href="/desk/tasks?tab=yours&due=overdue">В задачах →</BlockLink>}>
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
                <MoreButton items={() => menuOf(item)} />
              </div>
            </WorkRow>
          );
        })}
      </WorkList>
    </section>
  );
}

export type TeamRow = {
  id: string;
  name: string;
  ring: Tone | null;
  line: string;
  report: string | null;
  push: string | null;
};

/** What a person is at now; the count of the late ones is the one colour here (D-158). */
function TeamLine({ row }: { row: TeamRow }) {
  const cut = row.line.indexOf(" · ");
  if (row.ring !== "danger" || cut < 0) return <>{row.line}</>;
  return (
    <>
      <span className="text-danger">{row.line.slice(0, cut)}</span>
      {row.line.slice(cut)}
    </>
  );
}

/**
 * «Команда сейчас» (D-154): the trouble first — late, the director's move, a deadline within a day,
 * then the calm and the free; the day's report and a channel that does not reach the person. A
 * row leads to the person's tasks.
 */
export function TeamNow({
  rows,
  total,
  loading,
  onOpen,
  note,
  failed,
}: {
  rows: readonly TeamRow[];
  total: number;
  loading: boolean;
  onOpen: (id: string) => void;
  /** the people or their load did not load, or are an old copy */
  note: ReactNode;
  /** nobody to show: «В команде пока никого» would be a guess */
  failed: boolean;
}) {
  return (
    <section className="@container flex flex-col gap-1" data-testid="today-team">
      <SectionLabel action={<BlockLink href="/desk/team">{total > rows.length ? `Вся команда · ${total} →` : "Команда →"}</BlockLink>}>
        Команда сейчас
      </SectionLabel>
      {note}
      {failed ? null : loading ? (
        <SkeletonGroup className="desk-list">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex h-[34px] items-center">
              <Bone h={14} w="62%" />
            </div>
          ))}
        </SkeletonGroup>
      ) : rows.length === 0 ? (
        <EmptyState title="В команде пока никого" hint="Сотрудники появятся здесь со своей загрузкой — добавить можно в «Команде»" />
      ) : (
        <WorkList testId="today-team-list">
          {rows.map((row) => (
            <WorkRow key={row.id} testId="today-person" onOpen={() => onOpen(row.id)}>
              {/* the empty cell is the ring's: the words stand under the titles of the lists above */}
              <div className={`grid items-center gap-x-3 ${ROW_TEAM}`}>
                <PersonCell name={row.name} />
                <span />
                <span className="truncate text-[13px] text-muted" title={row.line}>
                  <TeamLine row={row} />
                </span>
                <span className="nums truncate text-[13px] text-muted">{row.report ?? ""}</span>
                {/* on a narrow block the channel's trouble folds to its mark, its words in the hint */}
                <span className="truncate text-right text-[13px] text-muted" title={row.push ?? undefined}>
                  {row.push ? (
                    <>
                      <span className="@min-[760px]:hidden">×</span>
                      <span className="@max-[760px]:hidden">{row.push}</span>
                    </>
                  ) : (
                    ""
                  )}
                </span>
              </div>
            </WorkRow>
          ))}
        </WorkList>
      )}
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

/* -------------------------------------------------------------------------- */
/* The right column: the day around the director                               */
/* -------------------------------------------------------------------------- */

/** A line of the right column: the time or the figure in the margin, the words on one vertical. */
const DAY_ROW = "grid grid-cols-[84px_minmax(0,1fr)] items-baseline gap-x-3 py-[7px] text-[13px] leading-5";

function Aside({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <section className="flex flex-col gap-1" data-testid={testId}>
      {children}
    </section>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="py-[7px] text-[13px] leading-5 text-muted">{children}</p>;
}

/**
 * «Встречи и сроки»: the day's meetings in order — the one on now in bold, the past ones quiet —
 * and the deadlines of the director's tasks that fall today.
 */
export function Agenda({
  events,
  loading,
  dueToday,
  dueLast,
  now,
  note,
  failed,
}: {
  events: readonly CalendarEvent[];
  loading: boolean;
  /** the meetings did not load, or are an old copy */
  note: ReactNode;
  /** no meetings to show: «Встреч сегодня нет» would be a guess */
  failed: boolean;
  dueToday: number;
  /** the last deadline of today — «до 18:00 — 3 срока задач» */
  dueLast: string | null;
  now: Date;
}) {
  const today = todayYmd(now);
  const todays = events.filter((event) => ymdOfEvent(event) === today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const later = todays.length === 0 ? nextEvent(events.filter((event) => ymdOfEvent(event) > today), now) : null;
  const known = !loading && !failed;
  return (
    <Aside testId="today-agenda">
      <SectionLabel action={<BlockLink href="/desk/calendar">Календарь →</BlockLink>}>Встречи и сроки</SectionLabel>
      {note}
      {known || dueToday > 0 ? (
        <ul className="desk-list">
          {!known ? null : todays.length === 0 ? (
            <li>
              <Quiet>{later ? `Встреч сегодня нет · ближайшая ${humanAqtobe(new Date(later.starts_at), now)}, «${later.title}»` : "Встреч сегодня нет"}</Quiet>
            </li>
          ) : (
            todays.map((event) => {
              const over = isOver(event, now);
              const live = isRunning(event, now);
              return (
                <li key={event.id}>
                  <Link href={`/desk/calendar?e=${encodeURIComponent(event.id)}`} prefetch={false} className={`desk-row ${DAY_ROW} ${over ? "text-muted" : ""}`}>
                    <When>{timeRange(event)}</When>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate" title={event.title}>
                        {event.title}
                        <span className="text-muted"> · {peopleCount(event)} чел.</span>
                      </span>
                      {live ? <span className="shrink-0 font-semibold">идёт</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })
          )}
          {dueToday > 0 ? (
            <li>
              <Link href="/desk/tasks?due=today" prefetch className={`desk-row ${DAY_ROW}`} data-testid="today-due">
                <When>{dueLast ? `до ${humanAqtobe(new Date(dueLast), now).replace(/^сегодня /, "")}` : "сегодня"}</When>
                <span>
                  <Num value={dueToday} /> {pluralRu(dueToday, ["срок задачи", "срока задач", "сроков задач"])}
                </span>
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </Aside>
  );
}

const ANSWERS: { value: VisitAnswer; label: string; main?: boolean }[] = [
  { value: "invited", label: "Пусть заходит", main: true },
  { value: "wait", label: "Подождёт" },
  { value: "declined", label: "Не приму" },
];

/**
 * «Приёмная»: the usual requests to the secretary as one click each (D-154), who waits at the door
 * with the phone's three answers (D-96), what the secretary wrote to the screen, and the director's
 * requests on their way — taken by whom, how long ago.
 */
export function Reception({
  visitors,
  messages,
  errands,
  now,
  onAnswer,
  busyId,
  note,
  failed,
}: {
  /** the visitors or the requests did not load, or are an old copy */
  note: ReactNode;
  /** «У двери никого» would be a guess */
  failed: boolean;
  visitors: readonly Visit[];
  messages: readonly Visit[];
  errands: readonly Errand[];
  now: Date;
  onAnswer: (visit: Visit, answer: VisitAnswer) => void;
  busyId: string | null;
}) {
  const quiet = visitors.length === 0 && messages.length === 0 && errands.length === 0;
  return (
    <Aside testId="today-reception">
      <SectionLabel action={<BlockLink href="/desk/errands">Заявки →</BlockLink>}>Приёмная</SectionLabel>
      {note}
      <ul className="desk-list">
        <li className="empty:hidden">
          <QuickErrands />
        </li>
        {visitors.map((visit) => {
          const waiting = visit.status === "waiting";
          return (
            <li key={visit.id} className={DAY_ROW} data-testid="today-visitor">
              <When className="text-muted">{waitedSince(visit.created_at, now)}</When>
              <span className="min-w-0">
                <span className={`block text-[12px] leading-4 ${waiting ? "text-warn" : "text-muted"}`}>{waiting ? "К вам посетитель" : "Посетитель ждёт"}</span>
                <span className="block text-[14px] font-medium leading-5 [overflow-wrap:anywhere]">{visit.note?.trim() || "Без имени"}</span>
              </span>
              {/* the three answers take the column's whole width: the sheet's left edge, one line */}
              <span className="col-span-2 mt-1.5 flex items-center gap-1">
                {ANSWERS.map((option) =>
                  option.value === "wait" && !waiting ? null : (
                    <MiniButton
                      key={option.value}
                      label={option.label}
                      main={Boolean(option.main)}
                      disabled={busyId === visit.id}
                      onPress={() => onAnswer(visit, option.value)}
                      testId={`visit-${option.value}`}
                    />
                  ),
                )}
              </span>
            </li>
          );
        })}
        {messages.map((visit) => (
          <li key={visit.id} className={DAY_ROW} data-testid="today-message">
            <When className="text-muted">{waitedSince(visit.created_at, now)}</When>
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <span className="block text-[12px] leading-4 text-muted">Сообщение</span>
                <span className="block leading-5">{visit.note?.trim() || "Без текста"}</span>
              </span>
              <MiniButton label="Понятно" disabled={busyId === visit.id} onPress={() => onAnswer(visit, "read")} testId="visit-read" />
            </span>
          </li>
        ))}
        {errands.map((errand) => {
          const who = shortName(errand.claimed?.full_name ?? "");
          return (
            <li key={errand.id}>
              <Link href={`/desk/errands?e=${encodeURIComponent(errand.id)}`} prefetch={false} className={`desk-row ${DAY_ROW}`} data-testid="today-errand">
                <When className="text-muted">{waitedFor(errand, now)}</When>
                <span className="min-w-0 truncate">
                  {errand.label}
                  <span className="text-muted"> — {who ? `${ERRAND_STATUS_WORD[errand.status]} · ${who}` : ERRAND_STATUS_WORD[errand.status]}</span>
                </span>
              </Link>
            </li>
          );
        })}
        {quiet && !failed ? (
          <li>
            <Quiet>У двери никого, ваших заявок в работе нет</Quiet>
          </li>
        ) : null}
      </ul>
    </Aside>
  );
}

/** When a move of the feed happened, in one short word: «09:08» today, «вчера», «пн», «21.10». */
function feedTime(at: Date, now: Date): string {
  const words = humanAqtobe(at, now);
  if (words.startsWith("сегодня ")) return words.slice("сегодня ".length);
  if (words.startsWith("вчера ")) return "вчера";
  return words.split(" ")[0] ?? words;
}

/**
 * «Лента»: today's moves of the company as the wall tells them — nominal words, never a guessed
 * gender. The wall keeps its last few whatever their day; «Сегодня» shows today's only (D-154).
 */
export function Feed({ events, loading, now, note, failed }: { events: readonly TvEvent[]; loading: boolean; now: Date; note: ReactNode; failed: boolean }) {
  const today = events.filter((event) => aqtobeDay(lineOf(event, false).at) === aqtobeDay(now));
  return (
    <Aside testId="today-feed">
      <SectionLabel>Лента</SectionLabel>
      {note}
      {loading || failed ? null : (
        <ul className="desk-list">
          {today.length === 0 ? (
            <li>
              <Quiet>Сегодня пока тихо — события дня появятся здесь</Quiet>
            </li>
          ) : (
            today.map((event) => {
              const line = lineOf(event, false);
              const words = line.label.charAt(0).toLowerCase() + line.label.slice(1);
              return (
                <li key={line.id} className={DAY_ROW}>
                  <When className="text-muted">{feedTime(line.at, now)}</When>
                  <span className="min-w-0 truncate" title={line.detail ? `${words} · «${line.detail}»` : words}>
                    {shortName(line.name)}
                    <span className="text-muted">
                      {" "}
                      · {words}
                      {line.detail ? ` «${line.detail}»` : ""}
                    </span>
                  </span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </Aside>
  );
}

/** «Отчёты сегодня» when the day did not load: the block stays, with what happened in it. */
export function ReportsFailed({ note }: { note: ReactNode }) {
  return (
    <Aside testId="today-reports">
      <SectionLabel>Отчёты сегодня</SectionLabel>
      {note}
    </Aside>
  );
}

/** «Отчёты сегодня 6 из 9» (D-152): who has handed in the day, who not yet — the names a click from the reports. */
export function Reports({ day }: { day: TeamDay }) {
  const due = day.rows.filter((row) => row.state === "submitted" || row.state === "pending" || row.state === "missed");
  const handed = due.filter((row) => row.state === "submitted").length;
  const missing = due.filter((row) => row.state !== "submitted");
  return (
    <Aside testId="today-reports">
      <SectionLabel action={<BlockLink href="/desk/reports">Отчёты →</BlockLink>}>Отчёты сегодня</SectionLabel>
      <div className="desk-list">
        {!day.workday ? (
          <Quiet>Сегодня не рабочий день — отчёты не ждём</Quiet>
        ) : due.length === 0 ? (
          <Quiet>Сегодня отчёт сдавать некому</Quiet>
        ) : (
          <div className={DAY_ROW}>
            <When>
              {handed} из {due.length}
            </When>
            <span className="min-w-0 text-muted">{missing.length > 0 ? `Ещё нет: ${missing.map((row) => shortName(row.full_name)).join(", ")}` : "Сдали все"}</span>
          </div>
        )}
      </div>
    </Aside>
  );
}
