"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { MenuButton, type MenuItem } from "@/components/desk/ui/Menu";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { timeOf } from "@/lib/daily-report/format";
import type { TeamDayRow } from "@/lib/daily-report/types";
import { formatNum } from "@/lib/desk/format";
import type { Load } from "@/lib/people/loads";
import { AVAILABILITY_LABEL, ROLE_LABEL, type Person } from "@/lib/people/queries";
import type { Health } from "@/lib/push/health";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue } from "@/lib/tasks/status-text";

import type { HeroFact } from "./Hero";
import { AVAILABILITY_TONE, Dot, roleLine } from "./shared";

/** What a person's peek can do — the same moves as the row's menu and its letters. */
export type PeekMoves = {
  /** «Дать задачу» — only where the director may give one (T). */
  give?: () => void;
  /** «Изменить» — only where the viewer may edit the card (E). */
  edit?: () => void;
  /** The card's page (Enter). */
  open: () => void;
  /** The rest of the row's menu, for «⋯». */
  more: MenuItem[];
};

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-baseline gap-3 border-t border-border/60 py-2 first:border-t-0">
      <dt className="w-[124px] shrink-0 text-[13px] leading-5 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14px] leading-5">{children}</dd>
    </div>
  );
}

/** The person's open work, the most urgent first: the stage ring, the title, the deadline (red when late). */
function OpenTasks({ tasks, personId, now }: { tasks: TaskWithPeople[]; personId: string; now: Date }) {
  const shown = tasks.slice(0, 8);
  return (
    <section className="flex flex-col gap-1.5" data-testid="person-peek-tasks">
      <SectionLabel
        count={tasks.length}
        action={
          tasks.length > 0 ? (
            <Link href={`/desk/tasks?who=${personId}`} className="text-[12px] font-medium leading-4 text-muted transition-colors hover:text-text">
              Все в «Задачах» →
            </Link>
          ) : null
        }
      >
        Открытые задачи
      </SectionLabel>
      {shown.length === 0 ? (
        <p className="text-[13px] leading-5 text-muted">Открытых задач нет</p>
      ) : (
        <ul className="overflow-hidden rounded-[10px] border border-border bg-surface/40">
          {shown.map((task) => {
            const late = isOverdue(task, now);
            return (
              <li key={task.id} className="border-t border-border/50 first:border-t-0">
                <Link
                  href={`/desk/tasks?id=${task.id}`}
                  className="flex min-h-9 items-center gap-2.5 px-3 py-1.5 transition-colors duration-[120ms] hover:bg-surface-2/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
                  title={task.title}
                >
                  <StatusGlyph status={task.status} overdue={late} size={16} />
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-5">{task.title}</span>
                  {task.deadline ? (
                    <span className="nums shrink-0 text-[12px] leading-4" style={{ color: late ? TONE_VAR.danger : "var(--text-muted)" }}>
                      {humanAqtobe(new Date(task.deadline), now).replace(/^сегодня /, "")}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {tasks.length > shown.length ? <p className="px-1 text-[12px] leading-4 text-muted">и ещё {tasks.length - shown.length}</p> : null}
    </section>
  );
}

/** Today's report in a word, leading to «Отчёты». */
function reportWord(row: TeamDayRow): { text: string; tone?: Tone } | null {
  if (row.state === "off") return null;
  if (row.state === "submitted") return { text: `сдан в ${timeOf(row.report?.submitted_at)}`, tone: "ok" };
  if (row.state === "missed") return { text: "не сдан", tone: "danger" };
  if (row.state === "pending") return { text: "ещё не сдан" };
  return { text: row.availability === "sick" ? "на больничном" : "в отпуске" };
}

/**
 * A person at a glance in the right-hand panel (D-154 wave 3): a click on a row of «Команда»
 * peeks here, the table stays in sight — who they are, how loaded, what they are on, today's
 * report, whether their phone hears; the moves of the row with their keys. The card's page is
 * one Enter away. The secretary sees the roster only (D-104): no tasks, no points, no report.
 */
export function PersonPeek({
  person,
  manager,
  director,
  load,
  ring,
  tasks,
  report,
  balance,
  push,
  now,
  moves,
}: {
  person: Person;
  manager: Person | null;
  director: boolean;
  load: Load | undefined;
  ring: Tone | null;
  tasks: TaskWithPeople[];
  report: TeamDayRow | undefined;
  /** Points when the game is on and the person plays; null — no figure. */
  balance: number | null;
  push: Health | undefined;
  now: Date;
  moves: PeekMoves;
}) {
  const works = person.is_active && person.role !== "tv";
  const facts: HeroFact[] = [];
  if (director && works && (person.role !== "director" || (load?.active ?? 0) > 0)) {
    const tasksOf = `/desk/tasks?who=${person.id}`;
    facts.push(
      { key: "work", value: load ? load.active - load.review : 0, label: "в работе", href: `${tasksOf}&tab=working` },
      { key: "overdue", value: load?.overdue ?? 0, label: "просрочено", tone: "danger", href: `${tasksOf}&tab=yours` },
      { key: "review", value: load?.review ?? 0, label: "на приёмке", tone: "warn", href: `${tasksOf}&tab=yours` },
    );
    if (balance !== null) facts.push({ key: "points", value: balance, label: "очков", tone: balance > 0 ? "gold" : "muted" });
  }
  const word = report ? reportWord(report) : null;

  return (
    <div className="flex flex-col gap-5 pr-8" data-testid="person-peek">
      <div className="flex items-center gap-3">
        <span className={person.is_active ? "" : "opacity-55"}>
          <Avatar name={person.full_name} ring={ring} size={48} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[19px] font-semibold leading-6 tracking-[-0.01em]" title={person.full_name}>
            {person.full_name}
          </p>
          <p className="truncate text-[13px] leading-[18px] text-muted">
            {roleLine(person)}
            {!person.is_active ? " · не работает" : works && person.availability !== "active" ? ` · ${AVAILABILITY_LABEL[person.availability].toLowerCase()}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="person-peek-moves">
        {moves.give ? (
          <Tooltip label="Строка поручения уже знает, кому" keys={["T"]}>
            <Button size="sm" onClick={moves.give} data-testid="person-peek-give">
              Дать задачу
            </Button>
          </Tooltip>
        ) : null}
        <Tooltip label="Открыть карточку целиком" keys={["Enter"]}>
          <Button size="sm" variant="secondary" onClick={moves.open} data-testid="person-peek-open">
            Карточка
          </Button>
        </Tooltip>
        {moves.edit ? (
          <Tooltip label="Изменить карточку" keys={["E"]}>
            <Button size="sm" variant="ghost" onClick={moves.edit} data-testid="person-peek-edit">
              Изменить
            </Button>
          </Tooltip>
        ) : null}
        {moves.more.length > 0 ? (
          <MenuButton
            items={moves.more}
            label="Ещё"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-[10px] text-[18px] leading-none text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            ⋯
          </MenuButton>
        ) : null}
      </div>

      {facts.length > 0 ? (
        <dl className="grid grid-cols-4 border-y border-border/60" data-testid="person-peek-facts">
          {facts.map((fact) => {
            const quiet = fact.value === 0;
            const body = (
              <>
                <dd className={`nums font-display text-[22px] font-bold leading-7 tracking-[-0.02em] ${quiet ? "text-muted/50" : ""}`} style={!quiet && fact.tone ? { color: TONE_VAR[fact.tone] } : undefined}>
                  {formatNum(fact.value)}
                </dd>
                <dt className="truncate text-[12px] leading-4 text-muted">{fact.label}</dt>
              </>
            );
            return fact.href ? (
              <Link key={fact.key} href={fact.href} className="flex min-w-0 flex-col rounded-[8px] px-2 py-2 transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40" title="Открыть в «Задачах»">
                {body}
              </Link>
            ) : (
              <div key={fact.key} className="flex min-w-0 flex-col px-2 py-2">
                {body}
              </div>
            );
          })}
        </dl>
      ) : null}

      {director && works && person.role !== "director" ? <OpenTasks tasks={tasks} personId={person.id} now={now} /> : null}

      <section className="flex flex-col gap-1">
        <SectionLabel>Карточка</SectionLabel>
        <dl>
          {person.position ? <FactRow label="Должность">{person.position}</FactRow> : null}
          {person.role !== "tv" ? <FactRow label="В речи">{person.aliases.length ? person.aliases.join(", ") : <span className="text-muted">—</span>}</FactRow> : null}
          <FactRow label="Роль">{ROLE_LABEL[person.role]}</FactRow>
          {person.role !== "director" && person.role !== "tv" ? <FactRow label="Руководитель">{manager?.full_name ?? <span className="text-muted">нет</span>}</FactRow> : null}
          {works ? (
            <FactRow label="Доступность">
              <Dot tone={AVAILABILITY_TONE[person.availability]}>{AVAILABILITY_LABEL[person.availability]}</Dot>
            </FactRow>
          ) : null}
          {director && word ? (
            <FactRow label="Отчёт сегодня">
              <Link href={`/desk/reports?p=${person.id}`} className="hover:underline" style={word.tone ? { color: TONE_VAR[word.tone] } : undefined} data-testid="person-peek-report">
                {word.text} →
              </Link>
            </FactRow>
          ) : null}
          {works ? (
            <FactRow label="Уведомления">
              {push ? (
                <Dot tone={push.state === "ok" ? "ok" : push.state === "idle" ? "muted" : "danger"}>{push.text}</Dot>
              ) : (
                <span className="text-muted">…</span>
              )}
            </FactRow>
          ) : null}
        </dl>
      </section>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-4 text-muted">
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> соседний
        </span>
        <span>
          <Kbd>Enter</Kbd> карточка
        </span>
        <span>
          <Kbd>Esc</Kbd> закрыть
        </span>
      </p>
    </div>
  );
}
