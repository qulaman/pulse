"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import type { MenuItem } from "@/components/desk/ui/Menu";
import { MenuButton } from "@/components/desk/ui/Menu";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import type { Tone } from "@/components/desk/ui/tone";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { When } from "@/components/desk/ui/When";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { DESK_STATUS_LABEL } from "@/lib/desk/tasks";
import { shortName } from "@/lib/people/names";
import { AVAILABILITY_LABEL, ROLE_LABEL, type Person } from "@/lib/people/queries";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { deadlineLabel, isOverdue } from "@/lib/tasks/status-text";

import { BlockLink, WorkList, WorkRow } from "./TodayParts";

/** A person of «Люди»: what they are at now, in the words of «Команда сейчас» (`personNow`). */
export type PersonRow = {
  id: string;
  name: string;
  ring: Tone | null;
  line: string;
  /** the open tasks on them, the director's own */
  active: number;
  report: string | null;
  /** the channel does not reach them — said in words, never a bare mark */
  push: string | null;
  away: boolean;
};

const BUSY_ROW = "grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-x-3 @min-[720px]:grid-cols-[150px_minmax(0,1fr)_96px_auto]";

/** The count of the late ones is the one colour of the line (D-158). */
function Line({ row }: { row: PersonRow }) {
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
 * «Люди» on the desk's home (D-164) — the phone's circles of people as the sheet's rows: those with
 * work first, by name — a list that stands still while their tasks move (the trouble has its own
 * blocks above), then the free ones in one line of names. A click opens the person in the panel
 * with their tasks and «Дать задачу»; the right button — the same moves at the cursor.
 */
export function PeopleNow({
  rows,
  loading,
  chosenId,
  onOpen,
  onMenu,
  note,
  failed,
}: {
  rows: readonly PersonRow[];
  loading: boolean;
  chosenId: string | null;
  onOpen: (id: string) => void;
  onMenu: (id: string, event: MouseEvent) => void;
  /** the people or their load did not load, or are an old copy */
  note: ReactNode;
  failed: boolean;
}) {
  const busy = rows.filter((row) => row.active > 0).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const free = rows.filter((row) => row.active === 0).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return (
    <section className="@container flex flex-col gap-1" data-testid="today-team">
      <SectionLabel count={rows.length} action={<BlockLink href="/desk/team">Команда →</BlockLink>}>
        Люди
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
        <EmptyState title="В команде пока никого" hint="Сотрудники появятся здесь со своими делами — добавить можно в «Команде» (N)" />
      ) : (
        <>
          {busy.length > 0 ? (
            <WorkList testId="today-team-list">
              {busy.map((row) => (
                <WorkRow key={row.id} rowKey={row.id} testId="today-person" chosen={chosenId === row.id} onOpen={() => onOpen(row.id)} onMenu={(event) => onMenu(row.id, event)}>
                  <div className={BUSY_ROW}>
                    <PersonCell name={row.name} />
                    <span className="truncate text-[13px] text-muted" title={row.line}>
                      <Line row={row} />
                    </span>
                    <span className="nums hidden truncate text-[13px] text-muted @min-[720px]:block">{row.report ?? ""}</span>
                    <span className="truncate text-right text-[12px] text-muted" title={row.push ? `${row.push} — задачи увидит, только открыв Pulse` : undefined}>
                      {row.push ?? ""}
                    </span>
                  </div>
                </WorkRow>
              ))}
            </WorkList>
          ) : null}
          {free.length > 0 ? (
            <div className="flex flex-col gap-1 pt-1" data-testid="today-free">
              <p className="text-[12px] font-medium leading-4 text-muted">Свободны · {free.length}</p>
              <div className="flex flex-wrap gap-1.5">
                {free.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onOpen(row.id)}
                    onContextMenu={(event) => onMenu(row.id, event)}
                    aria-pressed={chosenId === row.id}
                    title={[row.away ? row.line : "свободен — дать задачу", row.push].filter(Boolean).join(" · ")}
                    className={`desk-chip inline-flex h-8 items-center gap-1.5 rounded-[2px] border px-2.5 text-[13px] leading-5 transition-colors hover:border-text/60 ${chosenId === row.id ? "border-accent text-text" : "border-border"} ${row.away ? "text-muted" : ""}`}
                    data-testid="today-free-person"
                  >
                    {shortName(row.name)}
                    {row.away ? <span className="text-[12px] text-muted">· {row.line}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * A person in the home's panel (D-164) — the phone's `CrewCard`: who, where they are, their open
 * tasks from the director with the stage and the deadline; a task opens in the panel, its «⋯» and
 * right button hold every move (срок, напомнить, передать, отозвать). «Дать задачу» puts the person
 * into the order line (T); «Все дела» and «Карточка» lead on.
 */
export function PersonHome({
  person,
  tasks,
  now,
  onGive,
  onOpenTask,
  menuOf,
  onMenu,
}: {
  person: Person;
  tasks: readonly TaskWithPeople[];
  now: Date;
  onGive: (() => void) | null;
  onOpenTask: (id: string) => void;
  menuOf: (task: TaskWithPeople) => MenuItem[];
  onMenu: (task: TaskWithPeople, event: MouseEvent) => void;
}) {
  const away = person.availability !== "active";
  return (
    <div className="flex flex-col gap-4" data-testid="today-person-panel">
      <div className="pr-9">
        <p className="desk-figure truncate text-[22px] leading-7" title={person.full_name}>
          {person.full_name}
        </p>
        <p className="truncate text-[13px] leading-[18px] text-muted">
          {[person.position || ROLE_LABEL[person.role], away ? AVAILABILITY_LABEL[person.availability].toLowerCase() : null].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onGive ? (
          <Tooltip label="Строка поручения уже знает, кому" keys={["T"]} side="bottom">
            <Button size="sm" onClick={onGive} data-testid="today-person-give">
              Дать задачу
            </Button>
          </Tooltip>
        ) : null}
        <Link href={`/desk/tasks?who=${encodeURIComponent(person.id)}`} className="btn-secondary inline-flex h-9 items-center px-3 text-[13px] leading-4" data-testid="today-person-all">
          Все дела
        </Link>
        <Link href={`/desk/team/${encodeURIComponent(person.id)}`} className="inline-flex h-9 items-center px-2 text-[13px] leading-4 text-muted hover:text-text">
          Карточка →
        </Link>
      </div>
      <section className="flex flex-col gap-1">
        <SectionLabel count={tasks.length}>Задачи от вас</SectionLabel>
        {tasks.length === 0 ? (
          <p className="py-[7px] text-[13px] leading-5 text-muted">{onGive ? "Открытых задач нет — «Дать задачу» или T" : "Открытых задач нет"}</p>
        ) : (
          <ul className="desk-list" data-testid="today-person-tasks">
            {tasks.map((task) => {
              const late = isOverdue(task, now);
              const due = deadlineLabel(task, now);
              return (
                <li key={task.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      if ((event.target as Element).closest("button, a")) return;
                      onOpenTask(task.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        onOpenTask(task.id);
                      }
                    }}
                    onContextMenu={(event) => onMenu(task, event)}
                    className="desk-row grid min-h-[46px] cursor-pointer grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-2.5 py-1"
                    data-testid="today-person-task"
                  >
                    <StatusGlyph status={task.status} overdue={late} size={16} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] leading-5" title={task.title}>
                        {task.title}
                      </span>
                      <span className="block truncate text-[12px] leading-4 text-muted">
                        {DESK_STATUS_LABEL[task.status].toLowerCase()}
                        {" · "}
                        <When overdue={late}>{due.text}</When>
                        {` · дана ${humanAqtobe(new Date(task.created_at), now)}`}
                      </span>
                    </span>
                    <MenuButton
                      items={menuOf(task)}
                      label="Все действия"
                      className="flex h-8 w-8 items-center justify-center rounded-[2px] text-[16px] leading-none text-muted hover:bg-surface-2 hover:text-text"
                    >
                      ⋯
                    </MenuButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * «Только что отправлено» (D-164): what the director gave in the last half hour, newest first —
 * the order line's work is found again on the home, with where it stands now.
 */
export function JustSent({ tasks, now, onOpen, openId }: { tasks: readonly TaskWithPeople[]; now: Date; onOpen: (id: string) => void; openId: string | null }) {
  if (tasks.length === 0) return null;
  return (
    <section className="@container flex flex-col gap-1" data-testid="today-just-sent">
      <SectionLabel count={tasks.length}>Только что отправлено</SectionLabel>
      <WorkList>
        {tasks.map((task) => (
          <WorkRow key={task.id} rowKey={task.id} testId="today-sent-row" chosen={openId === task.id} onOpen={() => onOpen(task.id)}>
            <div className="grid grid-cols-[150px_16px_minmax(0,1fr)_auto] items-center gap-x-3">
              <PersonCell name={task.assignee?.full_name} />
              <StatusGlyph status={task.status} overdue={isOverdue(task, now)} size={16} />
              <span className="truncate text-[14px]" title={task.title}>
                {task.title}
              </span>
              <span className="text-[12px] text-muted">
                {DESK_STATUS_LABEL[task.status].toLowerCase()} · {humanAqtobe(new Date(task.created_at), now).replace(/^сегодня /, "")}
              </span>
            </div>
          </WorkRow>
        ))}
      </WorkList>
    </section>
  );
}
