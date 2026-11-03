"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import type { MenuItem } from "@/components/desk/ui/Menu";
import { Num } from "@/components/desk/ui/Num";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { QuickErrands } from "@/components/desk/ui/QuickErrands";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { MiniButton, MoreButton, MoveButton, MoveRow } from "@/components/desk/tasks/RowMoves";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { isOver, nextEvent, peopleCount, timeRange, ymdOfEvent } from "@/lib/calendar/agenda";
import { isRunning } from "@/lib/calendar/overview";
import type { CalendarEvent } from "@/lib/calendar/queries";
import type { TeamDay, TeamDayRow } from "@/lib/daily-report/types";
import { todayYmd } from "@/lib/datetime/calendar";
import { decisionLine, type Move } from "@/lib/desk/tasks";
import { ERRAND_STATUS_WORD, waitedFor, type Errand } from "@/lib/errands/queries";
import { shortName } from "@/lib/people/names";
import type { DeskItem } from "@/lib/tasks/desk";
import { REASON_TONE } from "@/lib/tasks/overview";
import { pluralRu, isOverdue } from "@/lib/tasks/status-text";
import { lineOf, type TvEvent } from "@/lib/tv/feed";
import type { Visit, VisitAnswer } from "@/lib/visits/queries";
import { waitedSince } from "@/lib/visits/text";

/* -------------------------------------------------------------------------- */
/* The left column: the director's work                                         */
/* -------------------------------------------------------------------------- */

/** A list of the work plane: flat, the table's own edge and rows (D-154). */
export function WorkList({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-surface/40" data-testid={testId}>
      {children}
    </div>
  );
}

/**
 * One row of a work list: the whole row opens, its buttons are its own, a right click is its menu.
 * `chosen` — open in the panel; `cursor` — under the keyboard's cursor (J/K), ringed like the
 * table's chosen row.
 */
function WorkRow({
  onOpen,
  onMenu,
  children,
  chosen = false,
  cursor = false,
  testId,
  rowKey,
}: {
  onOpen: () => void;
  onMenu?: (event: MouseEvent) => void;
  children: ReactNode;
  chosen?: boolean;
  cursor?: boolean;
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
      className={`group/row relative grid cursor-pointer items-center gap-x-4 border-b border-border/50 px-4 py-2 transition-colors duration-[120ms] last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${
        chosen || cursor ? "bg-accent/7" : "hover:bg-surface-2/55"
      } ${cursor ? "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]" : ""}`}
    >
      {children}
    </div>
  );
}

/**
 * «Ждут вашего решения» (D-154): приёмка, просьбы о сроке, вопросы, отказы — the queue's own order,
 * each with who, what, what exactly waits and the reason's two moves at hand. A click opens the
 * task in the panel. The late ones have a list of their own below.
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
}) {
  const shown = items.slice(0, limit);
  return (
    <section className="flex flex-col gap-2" data-testid="today-decisions">
      <SectionLabel
        count={items.length}
        action={
          items.length > 0 ? (
            <Link href="/desk/tasks?tab=yours" prefetch className="text-[13px] font-medium leading-4 text-muted transition-colors hover:text-text">
              Все в задачах →
            </Link>
          ) : null
        }
      >
        Ждут вашего решения
      </SectionLabel>
      {items.length === 0 ? (
        <EmptyState tone="ok" title="Ваших решений ничего не ждёт" hint="Сданная работа, вопросы, просьбы о сроке и отказы встанут сюда — с кнопками под рукой" />
      ) : (
        <WorkList testId="today-decisions-list">
          {shown.map((item) => (
            <WorkRow
              key={item.task.id}
              rowKey={item.task.id}
              testId="today-decision"
              chosen={openId === item.task.id}
              cursor={cursorId === item.task.id}
              onOpen={() => onOpen(item.task.id)}
              onMenu={(event) => onMenu(item, event)}
            >
              <div className={`grid items-center gap-x-4 ${compact ? "grid-cols-[156px_minmax(0,1fr)_28px]" : "grid-cols-[156px_minmax(0,1fr)_auto_28px]"}`}>
                <span data-act-for={item.task.id} data-act="reassign handoff">
                  <PersonCell name={item.task.assignee?.full_name} ring={REASON_TONE[item.reason]} />
                </span>
                <span className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-px shrink-0">
                    <StatusGlyph status={item.task.status} overdue={isOverdue(item.task, now)} size={18} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium" title={item.task.title}>
                      {item.task.title}
                    </span>
                    <span className="truncate text-[13px] leading-[18px] text-muted">{decisionLine(item.reason, item.task, now)}</span>
                  </span>
                </span>
                {compact ? (
                  <span
                    className="pointer-events-none absolute inset-y-0 right-12 hidden items-center pl-10 group-hover/row:pointer-events-auto group-hover/row:flex"
                    style={{ background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--surface-2) 55%, color-mix(in srgb, var(--surface) 40%, var(--bg))) 36px)" }}
                  >
                    <MoveRow moves={movesOf(item)} onPress={(move, target) => onMove(move, item, target)} showKeys={cursorId === item.task.id} />
                  </span>
                ) : (
                  <MoveRow moves={movesOf(item)} onPress={(move, target) => onMove(move, item, target)} showKeys={cursorId === item.task.id} />
                )}
                <MoreButton items={() => menuOf(item)} />
              </div>
            </WorkRow>
          ))}
          {items.length > shown.length ? (
            <Link href="/desk/inbox" prefetch className="block px-4 py-2.5 text-[13px] font-medium leading-4 text-muted transition-colors hover:bg-surface-2/55 hover:text-text">
              …ещё {items.length - shown.length} — разобрать по одной
            </Link>
          ) : null}
        </WorkList>
      )}
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
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="today-overdue">
      <SectionLabel
        count={items.length}
        action={
          <Link href="/desk/tasks?tab=yours&due=overdue" prefetch className="text-[13px] font-medium leading-4 text-muted transition-colors hover:text-text">
            В задачах →
          </Link>
        }
      >
        Просрочено
      </SectionLabel>
      <WorkList>
        {items.map((item) => {
          const [nudge] = movesOf(item);
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
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_28px] items-center gap-x-4">
                <span className="flex min-w-0 items-center gap-2.5">
                  <StatusGlyph status={item.task.status} overdue size={18} />
                  <span className="truncate font-medium" title={item.task.title}>
                    {item.task.title}
                  </span>
                  <span className="shrink-0 text-[13px] text-muted">{shortName(item.task.assignee?.full_name)}</span>
                </span>
                <span className="nums whitespace-nowrap text-[13px] font-semibold" style={{ color: "var(--danger)" }} data-act-for={item.task.id} data-act="extend retime">
                  {decisionLine("overdue", { ...item.task, nudged_at: null }, now)}
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

/**
 * «Команда сейчас» (D-154): the trouble first — late, the director's move, a deadline within a day,
 * then the calm and the free; the day's report and a channel that does not reach the person. A
 * row leads to the person's tasks.
 */
export function TeamNow({ rows, total, loading, onOpen }: { rows: readonly TeamRow[]; total: number; loading: boolean; onOpen: (id: string) => void }) {
  return (
    <section className="flex flex-col gap-2" data-testid="today-team">
      <SectionLabel
        count={total}
        action={
          <Link href="/desk/team" prefetch className="text-[13px] font-medium leading-4 text-muted transition-colors hover:text-text">
            {total > rows.length ? `Вся команда · ${total} →` : "Команда →"}
          </Link>
        }
      >
        Команда сейчас
      </SectionLabel>
      {loading ? (
        <SkeletonGroup className="flex flex-col gap-1">
          {Array.from({ length: 4 }, (_, index) => (
            <Bone key={index} h={48} />
          ))}
        </SkeletonGroup>
      ) : rows.length === 0 ? (
        <EmptyState title="В команде пока никого" hint="Сотрудники появятся здесь со своей загрузкой — добавить можно в «Команде»" />
      ) : (
        <WorkList testId="today-team-list">
          {rows.map((row) => (
            <WorkRow key={row.id} testId="today-person" onOpen={() => onOpen(row.id)}>
              <div className="grid grid-cols-[164px_minmax(0,1fr)_112px_148px] items-center gap-x-4">
                <PersonCell name={row.name} ring={row.ring} />
                <span className="truncate text-[13px] text-text/85" title={row.line}>
                  {row.line}
                </span>
                <span className="truncate text-[13px] text-muted">{row.report ?? ""}</span>
                <span className="truncate text-right text-[13px]" style={{ color: row.push ? "var(--warn)" : undefined }} title={row.push ?? undefined}>
                  {row.push ? `✕ ${row.push}` : ""}
                </span>
              </div>
            </WorkRow>
          ))}
        </WorkList>
      )}
    </section>
  );
}

/** The day's report of a person in a word: when it came, or that it has not yet. */
export function reportWord(row: TeamDayRow | undefined, now: Date): string | null {
  if (!row) return null;
  if (row.state === "submitted" && row.report?.submitted_at) return `отчёт ${humanAqtobe(new Date(row.report.submitted_at), now).replace(/^сегодня /, "")}`;
  if (row.state === "pending") return "без отчёта";
  if (row.state === "missed") return "нет отчёта";
  return null;
}

/* -------------------------------------------------------------------------- */
/* The right column: the day around the director                               */
/* -------------------------------------------------------------------------- */

function Aside({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <section className="flex flex-col gap-2.5 border-t border-border/60 pt-5 first:border-t-0 first:pt-0" data-testid={testId}>
      {children}
    </section>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-[18px] text-muted">{children}</p>;
}

/**
 * «Встречи и сроки»: the day's meetings in order — the one on now in the accent, the past ones
 * quiet — and the deadlines of the director's tasks that fall today.
 */
export function Agenda({
  events,
  loading,
  dueToday,
  dueLast,
  now,
}: {
  events: readonly CalendarEvent[];
  loading: boolean;
  dueToday: number;
  /** the last deadline of today — «до 18:00 — 3 срока задач» */
  dueLast: string | null;
  now: Date;
}) {
  const today = todayYmd(now);
  const todays = events.filter((event) => ymdOfEvent(event) === today).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const later = todays.length === 0 ? nextEvent(events.filter((event) => ymdOfEvent(event) > today), now) : null;
  return (
    <Aside testId="today-agenda">
      <SectionLabel
        action={
          <Link href="/desk/calendar" prefetch className="text-[13px] font-medium leading-4 text-muted transition-colors hover:text-text">
            Календарь →
          </Link>
        }
      >
        Встречи и сроки
      </SectionLabel>
      {loading ? null : todays.length === 0 ? (
        <Quiet>{later ? `Встреч сегодня нет · ближайшая ${humanAqtobe(new Date(later.starts_at), now)}, «${later.title}»` : "Встреч сегодня нет"}</Quiet>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {todays.map((event) => {
            const over = isOver(event, now);
            const live = isRunning(event, now);
            return (
              <li key={event.id}>
                <Link
                  href={`/desk/calendar?e=${encodeURIComponent(event.id)}`}
                  prefetch={false}
                  className={`-mx-2 flex items-baseline gap-3 rounded-[8px] px-2 py-1.5 transition-colors hover:bg-surface-2/55 ${over ? "opacity-55" : ""}`}
                >
                  <span className="nums w-[84px] shrink-0 text-[13px] text-muted">{timeRange(event)}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] leading-5" title={event.title}>
                    {event.title}
                    <span className="text-muted"> · {peopleCount(event)} чел.</span>
                  </span>
                  {live ? <span className="shrink-0 text-[12px] font-semibold text-accent">идёт</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {dueToday > 0 ? (
        <Link href="/desk/tasks?due=today" prefetch className="-mx-2 flex items-baseline gap-3 rounded-[8px] px-2 py-1.5 text-[13px] leading-[18px] transition-colors hover:bg-surface-2/55" data-testid="today-due">
          <span className="nums w-[84px] shrink-0 text-muted">{dueLast ? `до ${humanAqtobe(new Date(dueLast), now).replace(/^сегодня /, "")}` : "сегодня"}</span>
          <span className="text-text/85">
            <Num value={dueToday} className="font-semibold" /> {pluralRu(dueToday, ["срок задачи", "срока задач", "сроков задач"])}
          </span>
        </Link>
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
}: {
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
      <SectionLabel
        action={
          <Link href="/desk/errands" prefetch className="text-[13px] font-medium leading-4 text-muted transition-colors hover:text-text">
            Заявки →
          </Link>
        }
      >
        Приёмная
      </SectionLabel>
      <QuickErrands />
      {visitors.map((visit) => {
        const waiting = visit.status === "waiting";
        return (
          <div
            key={visit.id}
            className="rounded-[12px] border px-3 py-2.5"
            style={{
              borderColor: waiting ? "color-mix(in srgb, var(--accent) 45%, var(--border))" : "var(--border)",
              background: waiting ? "color-mix(in srgb, var(--accent) 7%, var(--surface))" : "var(--surface)",
            }}
            data-testid="today-visitor"
          >
            <p className="text-[12px] leading-4 text-muted">
              {waiting ? "К вам посетитель" : "Посетитель ждёт"} · {waitedSince(visit.created_at, now)}
            </p>
            <p className="mt-0.5 text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]">{visit.note?.trim() || "Без имени"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
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
            </div>
          </div>
        );
      })}
      {messages.map((visit) => (
        <div key={visit.id} className="flex items-start gap-3 rounded-[12px] border border-border px-3 py-2.5" data-testid="today-message">
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] leading-4 text-muted">Сообщение · {waitedSince(visit.created_at, now)}</span>
            <span className="block text-[14px] leading-5 [overflow-wrap:anywhere]">{visit.note?.trim() || "Без текста"}</span>
          </span>
          <MiniButton label="Понятно" disabled={busyId === visit.id} onPress={() => onAnswer(visit, "read")} testId="visit-read" />
        </div>
      ))}
      {errands.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {errands.map((errand) => {
            const who = shortName(errand.claimed?.full_name ?? "");
            return (
              <li key={errand.id}>
                <Link
                  href={`/desk/errands?e=${encodeURIComponent(errand.id)}`}
                  prefetch={false}
                  className="-mx-2 flex items-baseline gap-2 rounded-[8px] px-2 py-1.5 text-[13px] leading-[18px] transition-colors hover:bg-surface-2/55"
                  data-testid="today-errand"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-[14px] text-text">{errand.label}</span>
                    <span className="text-muted">
                      {" "}
                      — {who ? `${ERRAND_STATUS_WORD[errand.status]} · ${who}` : ERRAND_STATUS_WORD[errand.status]}
                    </span>
                  </span>
                  <span className="nums shrink-0 text-muted">{waitedFor(errand, now)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {quiet ? <Quiet>У двери никого, ваших заявок в работе нет</Quiet> : null}
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
export function Feed({ events, loading, now }: { events: readonly TvEvent[]; loading: boolean; now: Date }) {
  const today = events.filter((event) => aqtobeDay(lineOf(event, false).at) === aqtobeDay(now));
  return (
    <Aside testId="today-feed">
      <SectionLabel>Лента</SectionLabel>
      {loading ? null : today.length === 0 ? (
        <Quiet>Сегодня пока тихо — события дня появятся здесь</Quiet>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {today.map((event) => {
            const line = lineOf(event, false);
            // gold is the reward's and «принято»'s alone (D-154)
            const gold = line.kind === "task_done" || line.kind === "points" || line.kind === "merch";
            return (
              <li key={line.id} className="flex items-baseline gap-3 text-[13px] leading-[18px]">
                <span className="nums w-[44px] shrink-0 text-muted">{feedTime(line.at, now)}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-text">{shortName(line.name)}</span>
                  <span className="text-muted"> · </span>
                  <span style={{ color: gold ? TONE_VAR.gold : "var(--text-muted)" }}>{line.label.charAt(0).toLowerCase() + line.label.slice(1)}</span>
                  {line.detail ? <span className="block truncate text-muted" title={line.detail}>«{line.detail}»</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Aside>
  );
}

/** «Отчёты сегодня 6/9» (D-152): who has handed in the day, who not yet — the names a click from the reports. */
export function Reports({ day }: { day: TeamDay }) {
  const due = day.rows.filter((row) => row.state === "submitted" || row.state === "pending" || row.state === "missed");
  const handed = due.filter((row) => row.state === "submitted").length;
  const missing = due.filter((row) => row.state !== "submitted");
  return (
    <Aside testId="today-reports">
      <SectionLabel
        action={
          <Link href="/desk/reports" prefetch className="text-[13px] font-medium leading-4 text-muted transition-colors hover:text-text">
            Отчёты →
          </Link>
        }
      >
        Отчёты сегодня
      </SectionLabel>
      {!day.workday ? (
        <Quiet>Сегодня не рабочий день — отчёты не ждём</Quiet>
      ) : due.length === 0 ? (
        <Quiet>Сегодня отчёт сдавать некому</Quiet>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="nums font-display text-[28px] font-bold leading-8 tracking-[-0.02em]">
              {handed}
              <span className="text-muted/70">/{due.length}</span>
            </span>
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span className="absolute inset-y-0 left-0 rounded-full bg-ok transition-[width] duration-[600ms] ease-out" style={{ width: `${(handed / due.length) * 100}%` }} />
            </span>
          </div>
          {missing.length > 0 ? (
            <Quiet>
              Ещё нет: <span className="text-text/85">{missing.map((row) => shortName(row.full_name)).join(", ")}</span>
            </Quiet>
          ) : (
            <Quiet>Сдали все</Quiet>
          )}
        </>
      )}
    </Aside>
  );
}
