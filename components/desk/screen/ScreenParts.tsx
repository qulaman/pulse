"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { TileFace } from "@/components/desk/team/TeamGrid";
import { Dialog } from "@/components/desk/ui/Dialog";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { SearchField } from "@/components/desk/ui/Toolbar";
import { LoginCodePanel } from "@/components/people/LoginCodePanel";
import { Button } from "@/components/ui/Button";
import { ANSWERS } from "@/components/visits/VisitAsk";
import type { MindBoard } from "@/lib/mindboard/queries";
import { shortName, useNamesKey } from "@/lib/people/names";
import type { Person } from "@/lib/people/queries";
import { ROLE_LABEL } from "@/lib/people/queries";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { SHORT_STATUS } from "@/lib/tasks/status-text";
import { countLine, type BoardCount } from "@/lib/tv/presenter";
import type { Visit, VisitAnswer } from "@/lib/visits/queries";
import { waitedSince } from "@/lib/visits/text";

/** Rows a pick list shows before the search narrows it. */
const PICK_ROWS = 8;
/** What can go up on the wall: a live order or an accepted one — never a declined or revoked (D-45, `tv_control`). */
const ON_WALL = new Set(["sent", "accepted", "in_progress", "rework", "pending_review", "done"]);

const lower = (text: string) => text.toLowerCase().replace(/ё/g, "е");

/** A block of the panel: the section's label over a rule of print, its controls under the rule — in «Графит» a card. */
export function Section({ title, children, testId, end }: { title: string; children: ReactNode; testId?: string; end?: ReactNode }) {
  return (
    <section className="screen-card flex flex-col" data-testid={testId}>
      <SectionLabel action={end} className="screen-card-title mb-0.5">
        {title}
      </SectionLabel>
      <div className="screen-card-body desk-list">{children}</div>
    </section>
  );
}

/** A setting of the wall: its name on the left, its control on the right. */
export function SettingRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="screen-setting flex min-h-9 items-center justify-between gap-3">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="text-[14px] leading-5">{label}</span>
        {hint ? <span className="truncate text-[12px] leading-4 text-muted">{hint}</span> : null}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

/** An on/off of the wall — the guest in the office: the desk's small ruled box (journal.css). */
export function Switch({ on, onToggle, label, testId, disabled }: { on: boolean; onToggle: () => void; label: string; testId?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      data-testid={testId}
      className="screen-switch relative shrink-0 transition-colors duration-[120ms] disabled:opacity-40"
    >
      <span aria-hidden className="absolute transition-transform duration-[120ms]" />
    </button>
  );
}

/** Ten minutes on the wall: a person or an order goes up for that long (D-123). */
const FOCUS_MINUTES = 10;

/** What is left of the ten minutes, as a ring that empties — beside the words that say it. */
function MinutesRing({ minutes }: { minutes: number }) {
  const part = Math.max(0, Math.min(1, minutes / FOCUS_MINUTES));
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" className="screen-ring">
      <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2.2" className="screen-ring-track" />
      <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2.2" pathLength={100} strokeDasharray="100" strokeLinecap="round" className="screen-ring-left" style={{ "--left": 100 - part * 100 } as CSSProperties} />
    </svg>
  );
}

/** A row of a pick list: the thing, and the word of what it is doing on the wall. */
function PickRow({ children, lit, onClick, testId, note, minutes }: { children: ReactNode; lit: boolean; onClick: () => void; testId: string; note?: string | null; minutes?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={lit}
      data-lit={lit ? "" : undefined}
      className={`screen-pick-row flex min-h-9 w-full items-center gap-2 border-b border-border/60 pr-1 text-left transition-colors duration-[120ms] last:border-b-0 hover:bg-surface-2/60 ${lit ? "bg-accent/[0.08] pl-2 shadow-[inset_2px_0_0_var(--accent)]" : "pl-0"}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {note ? (
        <span className={`screen-pick-note nums flex shrink-0 items-center gap-1.5 text-[12px] leading-4 ${lit ? "text-accent" : "text-muted"}`}>
          {lit && minutes !== undefined ? <MinutesRing minutes={minutes} /> : null}
          {note}
        </span>
      ) : null}
    </button>
  );
}

/** A person of the pick list: the face, the name, what they do. */
function PersonPickLine({ person }: { person: Person }) {
  // re-reads the company's names, so «Ерлан» becomes «Ерлан Б.» once the roster has come
  useNamesKey();
  const sub = person.position || ROLE_LABEL[person.role];
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="screen-pick-face">
        <TileFace person={person} size={26} />
      </span>
      <span className="block min-w-0 truncate text-[14px] leading-5" title={person.full_name}>
        {shortName(person.full_name)}
        {sub ? <span className="text-[12px] text-muted"> · {sub}</span> : null}
      </span>
    </span>
  );
}

/** «Кого показать»: a person's tasks on the wall for ten minutes, a second click — ten more. */
export function PeoplePick({ people, activeId, minutes, onPick }: { people: Person[]; activeId: string | null; minutes: number; onPick: (person: Person) => void }) {
  const [query, setQuery] = useState("");
  const roster = useMemo(() => people.filter((person) => person.is_active && person.role !== "tv"), [people]);
  const needle = lower(query.trim());
  const shown = roster.filter((person) => !needle || lower(`${person.full_name} ${person.position ?? ""}`).includes(needle));
  return (
    <>
      {roster.length > PICK_ROWS ? <SearchField value={query} onChange={setQuery} placeholder="Имя или должность" width={360} /> : null}
      <div className="no-bar flex max-h-[324px] flex-col overflow-y-auto" data-testid="desk-screen-people">
        {shown.map((person) => {
          const lit = person.id === activeId;
          return (
            <PickRow key={person.id} lit={lit} testId="desk-screen-person" note={lit ? `на стене · ${minutes} мин` : null} minutes={minutes} onClick={() => onPick(person)}>
              <PersonPickLine person={person} />
            </PickRow>
          );
        })}
        {shown.length === 0 ? <p className="px-2 py-2 text-[13px] leading-[18px] text-muted">Никого не нашёл</p> : null}
      </div>
    </>
  );
}

/** «Дело на стене» (D-123): one of the director's live orders, whole, for ten minutes. */
export function TaskPick({ tasks, activeId, minutes, onPick }: { tasks: TaskWithPeople[]; activeId: string | null; minutes: number; onPick: (task: TaskWithPeople) => void }) {
  const [query, setQuery] = useState("");
  const needle = lower(query.trim());
  const live = tasks.filter((task) => ON_WALL.has(task.status));
  const shown = live.filter((task) => !needle || lower(`${task.title} ${task.assignee?.full_name ?? ""}`).includes(needle)).slice(0, PICK_ROWS);
  return (
    <>
      <SearchField value={query} onChange={setQuery} placeholder="Найти задачу" width={360} />
      <div className="flex flex-col" data-testid="desk-screen-tasks">
        {shown.map((task) => {
          const lit = task.id === activeId;
          return (
            <PickRow key={task.id} lit={lit} testId="desk-screen-task" note={lit ? `на стене · ${minutes} мин` : SHORT_STATUS[task.status]} minutes={minutes} onClick={() => onPick(task)}>
              <span className="block truncate text-[14px] leading-5">
                {task.title}
                {task.assignee?.full_name ? <span className="text-[12px] text-muted"> · {task.assignee.full_name}</span> : null}
              </span>
            </PickRow>
          );
        })}
        {shown.length === 0 ? <p className="px-2 py-2 text-[13px] leading-[18px] text-muted">{needle ? "Ничего не нашёл" : "Живых задач нет"}</p> : null}
      </div>
    </>
  );
}

/**
 * The director's boards for the wall (D-102, D-140, D-144): «На стену» till the evening, and the
 * week's board — one board in the round of screensavers till Sunday night.
 */
export function BoardsPick({
  boards,
  counts,
  wallId,
  weekId,
  weekBusy,
  onPut,
  onWeek,
}: {
  boards: MindBoard[];
  counts: Map<string, BoardCount>;
  wallId: string | null;
  weekId: string | null;
  weekBusy: boolean;
  onPut: (board: MindBoard) => void;
  onWeek: (board: MindBoard, on: boolean) => void;
}) {
  if (boards.length === 0) {
    return (
      <p className="text-[13px] leading-[18px] text-muted">
        Досок пока нет — <Link href="/desk/notes?tab=boards" className="font-medium text-text underline underline-offset-2">заметки → доски</Link>
      </p>
    );
  }
  return (
    <ul className="no-bar flex max-h-[324px] flex-col overflow-y-auto" data-testid="desk-screen-boards">
      {boards.map((board) => {
        const lit = board.id === wallId;
        const week = board.id === weekId;
        return (
          <li key={board.id} data-lit={lit ? "" : undefined} className={`screen-board-row flex min-h-11 items-center gap-1 border-b border-border/60 last:border-b-0 ${lit ? "bg-accent/[0.08] pl-2 shadow-[inset_2px_0_0_var(--accent)]" : ""}`}>
            <span className="min-w-0 flex-1">
              <Link href={`/desk/notes/b/${board.id}`} className="block truncate text-[14px] leading-5 hover:underline">
                {board.title}
              </Link>
              <span className="block truncate text-[12px] leading-4 text-muted">
                {countLine(counts.get(board.id))}
                {lit ? " · на стене" : ""}
                {week ? " · доска недели" : ""}
              </span>
            </span>
            <Button size="sm" variant="ghost" className={week ? "!text-accent" : ""} aria-pressed={week} disabled={weekBusy} onClick={() => onWeek(board, !week)} title="В круг заставок до воскресенья, 21:00">
              Неделя
            </Button>
            <Button size="sm" variant="secondary" disabled={lit} onClick={() => onPut(board)} data-testid="desk-screen-board">
              На стену
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The secretary's visitor and her messages on the wall (D-96, D-116): the director answers here
 * as on the phone — three answers to a visitor, «Понятно» to a message.
 */
export function Visits({
  visitors,
  messages,
  now,
  busyId,
  onAnswer,
}: {
  visitors: Visit[];
  messages: Visit[];
  now: Date;
  busyId: string | null;
  onAnswer: (visit: Visit, answer: VisitAnswer) => void;
}) {
  if (visitors.length + messages.length === 0) return null;
  return (
    <div className="screen-visits desk-list" data-testid="desk-screen-visits">
      {visitors.map((visit) => {
        const waiting = visit.status === "waiting";
        return (
          <article key={visit.id} className={`screen-visit py-2.5 ${waiting ? "pl-3 shadow-[inset_2px_0_0_var(--accent)]" : ""}`} data-waiting={waiting ? "" : undefined}>
            <p className="text-[12px] leading-4 text-muted">
              {waiting ? "К вам посетитель" : "Посетитель ждёт"} · {waitedSince(visit.created_at, now)}
              {waiting ? " · на стене поверх всего" : ""}
            </p>
            <p className="mt-0.5 text-[15px] font-semibold leading-5">{visit.note?.trim() || "Без имени"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ANSWERS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant="secondary"
                  className={option.value === "invited" ? "desk-move" : ""}
                  disabled={busyId === visit.id || (option.value === "wait" && !waiting)}
                  onClick={() => onAnswer(visit, option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </article>
        );
      })}
      {messages.map((message) => (
        <article key={message.id} className="screen-visit py-2.5 pl-3 shadow-[inset_2px_0_0_var(--accent)]" data-waiting="">
          <p className="text-[12px] leading-4 text-muted">Сообщение секретаря · {waitedSince(message.created_at, now)} · на стене поверх всего</p>
          <p className="mt-0.5 text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]">{message.note?.trim()}</p>
          <div className="mt-2">
            <Button size="sm" variant="secondary" className="desk-move" disabled={busyId === message.id} onClick={() => onAnswer(message, "read")}>
              Понятно
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * «Подключить экран» (D-135): a one-time code for the wall's kiosk user, typed with the TV's
 * remote — issued the moment the dialog opens, as on the phone's remote.
 */
export function ConnectDialog({ open, onClose, screens }: { open: boolean; onClose: () => void; screens: Person[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const person = screens.find((p) => p.id === picked) ?? (screens.length === 1 ? screens[0] : null);
  const close = () => {
    setPicked(null);
    setRound((n) => n + 1);
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} title={person ? `Подключить экран · ${person.full_name}` : "Подключить экран"} width="md">
      {person ? (
        <LoginCodePanel key={`${person.id}-${round}`} person={person} tv autoIssue onDone={close} />
      ) : screens.length > 1 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] leading-5 text-muted">Какой экран подключить?</p>
          {screens.map((screen) => (
            <Button key={screen.id} size="sm" variant="secondary" onClick={() => setPicked(screen.id)}>
              {screen.full_name}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-[14px] leading-5 text-muted">
          Экрана нет среди сотрудников: «Команда» → «Новый сотрудник», роль «ТВ-экран». Потом — сюда.
        </p>
      )}
    </Dialog>
  );
}
