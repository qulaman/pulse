"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { SearchField } from "@/components/desk/ui/Toolbar";
import { LoginCodePanel } from "@/components/people/LoginCodePanel";
import { Button } from "@/components/ui/Button";
import { ANSWERS } from "@/components/visits/VisitAsk";
import type { MindBoard } from "@/lib/mindboard/queries";
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

/** A block of the panel: a quiet title over its controls. */
export function Section({ title, children, testId, end }: { title: string; children: ReactNode; testId?: string; end?: ReactNode }) {
  return (
    <section className="card flex flex-col gap-2.5 px-4 py-3.5" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="eyebrow">{title}</h2>
        {end}
      </div>
      {children}
    </section>
  );
}

/** A key of the panel: lit while what it names is on the wall. */
export function Key({
  on = false,
  children,
  onClick,
  disabled,
  testId,
  label,
}: {
  on?: boolean;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  label?: string;
}) {
  return (
    <Button size="sm" variant={on ? "primary" : "secondary"} aria-pressed={on} aria-label={label} disabled={disabled} onClick={onClick} data-testid={testId} className="w-full">
      {children}
    </Button>
  );
}

/** A row of a pick list: the thing, and the word of what it is doing on the wall. */
function PickRow({ children, lit, onClick, testId, note }: { children: ReactNode; lit: boolean; onClick: () => void; testId: string; note?: string | null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={lit}
      className={`flex min-h-[40px] w-full items-center gap-2 rounded-[10px] px-2 text-left transition-colors duration-[120ms] hover:bg-surface-2/70 ${lit ? "bg-accent/[0.08]" : ""}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {note ? <span className={`nums shrink-0 text-[12px] font-semibold leading-4 ${lit ? "text-accent" : "text-muted"}`}>{note}</span> : null}
    </button>
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
      <div className="flex max-h-[320px] flex-col overflow-y-auto" data-testid="desk-screen-people">
        {shown.map((person) => {
          const lit = person.id === activeId;
          return (
            <PickRow key={person.id} lit={lit} testId="desk-screen-person" note={lit ? `на стене · ${minutes} мин` : null} onClick={() => onPick(person)}>
              <PersonCell name={person.full_name} sub={person.position || ROLE_LABEL[person.role]} />
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
            <PickRow key={task.id} lit={lit} testId="desk-screen-task" note={lit ? `на стене · ${minutes} мин` : SHORT_STATUS[task.status]} onClick={() => onPick(task)}>
              <span className="block truncate text-[14px] leading-5">{task.title}</span>
              <span className="block truncate text-[12px] leading-4 text-muted">{task.assignee?.full_name ?? ""}</span>
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
        Досок пока нет — <Link href="/desk/notes?tab=boards" className="font-semibold text-accent">заметки → доски</Link>
      </p>
    );
  }
  return (
    <ul className="flex max-h-[300px] flex-col overflow-y-auto" data-testid="desk-screen-boards">
      {boards.map((board) => {
        const lit = board.id === wallId;
        const week = board.id === weekId;
        return (
          <li key={board.id} className={`flex min-h-[44px] items-center gap-2 rounded-[10px] px-2 ${lit ? "bg-accent/[0.08]" : ""}`}>
            <span className="min-w-0 flex-1">
              <Link href={`/desk/notes/b/${board.id}`} className="block truncate text-[14px] leading-5 hover:text-accent">
                {board.title}
              </Link>
              <span className="block truncate text-[12px] leading-4 text-muted">
                {countLine(counts.get(board.id))}
                {lit ? " · на стене" : ""}
                {week ? " · доска недели" : ""}
              </span>
            </span>
            <Button size="sm" variant={week ? "primary" : "ghost"} aria-pressed={week} disabled={weekBusy} onClick={() => onWeek(board, !week)} title="В круг заставок до воскресенья, 21:00">
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
    <div className="flex flex-col gap-2" data-testid="desk-screen-visits">
      {visitors.map((visit) => {
        const waiting = visit.status === "waiting";
        return (
          <article
            key={visit.id}
            className="rounded-[12px] border px-4 py-3"
            style={{
              borderColor: waiting ? "color-mix(in srgb, var(--accent) 55%, var(--border))" : "var(--border)",
              background: waiting ? "color-mix(in srgb, var(--accent) 8%, var(--surface))" : "var(--surface)",
            }}
          >
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
                  variant={option.value === "invited" ? "primary" : "secondary"}
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
        <article
          key={message.id}
          className="rounded-[12px] border px-4 py-3"
          style={{ borderColor: "color-mix(in srgb, var(--accent) 55%, var(--border))", background: "color-mix(in srgb, var(--accent) 8%, var(--surface))" }}
        >
          <p className="text-[12px] leading-4 text-muted">Сообщение секретаря · {waitedSince(message.created_at, now)} · на стене поверх всего</p>
          <p className="mt-0.5 text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]">{message.note?.trim()}</p>
          <div className="mt-2">
            <Button size="sm" disabled={busyId === message.id} onClick={() => onAnswer(message, "read")}>
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
