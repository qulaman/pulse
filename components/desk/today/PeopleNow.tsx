"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import type { MenuItem } from "@/components/desk/ui/Menu";
import { MenuButton } from "@/components/desk/ui/Menu";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import type { Tone } from "@/components/desk/ui/tone";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { When } from "@/components/desk/ui/When";
import { CrewCircle, IdleCircle } from "@/components/pulse/CrewCircle";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { DESK_STATUS_LABEL } from "@/lib/desk/tasks";
import type { Look } from "@/lib/idle/look";
import { initialsOf, RING_OUT } from "@/lib/idle/people";
import { shortName } from "@/lib/people/names";
import { AVAILABILITY_LABEL, ROLE_LABEL, type Person } from "@/lib/people/queries";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { deadlineLabel, isOverdue } from "@/lib/tasks/status-text";
import { useDeepRest } from "@/lib/useDeepRest";

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
  /** the phone's circle of this person (D-118): the colour, the ring and the badge of their work */
  look: Look;
};

/** The circle of a person (D-168): larger than the phone's — a photo is to go in it. */
const CIRCLE = 52;
/** The ring of the chosen one stands this far out of the circle: clear of the stage ring and of its lift. */
const CHOSEN_OUT = RING_OUT + 8;
/** The square the circle stands in: its rings and the chosen one's never reach the name under it. */
const STAGE = CIRCLE + CHOSEN_OUT * 2 + 2;
/** Tiles per row follow the column: never narrower than this. */
const TILES = "grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-1 gap-y-2";

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

/** The loading frame of «Люди»: a row of round places with the names' room under them. */
export function PeopleBone({ count = 8 }: { count?: number }) {
  return (
    <div className={`desk-crew-bones ${TILES}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col items-center gap-1 pb-1">
          <div className="flex items-center justify-center" style={{ width: STAGE, height: STAGE }}>
            <Bone round w={CIRCLE} h={CIRCLE} />
          </div>
          <Bone h={12} w={52} />
        </div>
      ))}
    </div>
  );
}

/**
 * «Люди» on the desk's home (D-164, circles since D-168) — the phone's circles of people as tiles:
 * those with work first, lit in the colour of the stage with the ring that says whether the work is
 * moving (the phone's `CrewCircle`), then the free ones, grey (`IdleCircle`); by name inside each,
 * so a place stands still while the tasks move. A click chooses the person: the ring of the chosen
 * one breathes round the circle, as on the phone, and their card opens right under the tiles —
 * a click on the same circle, × or Esc puts it away. The right button — the same moves at the cursor.
 */
export function PeopleNow({
  rows,
  loading,
  chosenId,
  onOpen,
  onMenu,
  note,
  failed,
  card,
}: {
  rows: readonly PersonRow[];
  loading: boolean;
  chosenId: string | null;
  /** a click on a circle: the screen opens that person, or closes them when already open */
  onOpen: (id: string) => void;
  onMenu: (id: string, event: MouseEvent) => void;
  /** the people or their load did not load, or are an old copy */
  note: ReactNode;
  failed: boolean;
  /** the chosen person's card, drawn under the tiles */
  card: ReactNode;
}) {
  const busy = rows.filter((row) => row.look.busy || row.active > 0).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const free = rows.filter((row) => !row.look.busy && row.active === 0).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  // a board left open stops its rings (lib/useDeepRest.ts), as the phone's does
  const asleep = useDeepRest();
  const sheet = useRef<HTMLDivElement | null>(null);
  const open = Boolean(card) && chosenId !== null;

  // a person chosen by a click: the card is brought into view if it opened below the fold
  const shown = useRef(chosenId);
  useEffect(() => {
    if (shown.current === chosenId) return;
    shown.current = chosenId;
    if (!chosenId) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sheet.current?.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  }, [chosenId]);

  const tiles = (list: readonly PersonRow[], testId?: string) => (
    <div className={TILES} data-testid={testId}>
      {list.map((row) => (
        <PersonTile key={row.id} row={row} chosen={chosenId === row.id} onOpen={onOpen} onMenu={onMenu} />
      ))}
    </div>
  );

  return (
    <section className="desk-crew @container flex flex-col gap-1" data-testid="today-team" data-asleep={asleep ? "" : undefined}>
      <SectionLabel count={rows.length} action={<BlockLink href="/desk/team">Команда →</BlockLink>}>
        Люди
      </SectionLabel>
      {note}
      {failed ? null : loading ? (
        <SkeletonGroup>
          <PeopleBone />
        </SkeletonGroup>
      ) : rows.length === 0 ? (
        <EmptyState title="В команде пока никого" hint="Сотрудники появятся здесь со своими делами — добавить можно в «Команде» (N)" />
      ) : (
        <>
          {busy.length > 0 ? (
            <div className="flex flex-col gap-1 pt-1">
              <p className="text-[12px] font-medium leading-4 text-muted">С задачами · {busy.length}</p>
              {tiles(busy, "today-team-list")}
            </div>
          ) : null}
          {free.length > 0 ? (
            <div className="flex flex-col gap-1 pt-1" data-testid="today-free">
              <p className="text-[12px] font-medium leading-4 text-muted">Свободны · {free.length}</p>
              {tiles(free)}
            </div>
          ) : null}
          {open ? (
            <div ref={sheet} className="desk-crew-card mt-2" data-testid="today-person-card">
              {/* keyed by person: another one chosen, the card's words change over in place */}
              <div key={chosenId} className="desk-crew-card-body">
                {card}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * One person as a tile: the circle and the short name under it. The phone's own circles — lit with
 * the stage ring when there is work, grey and shivering when there is none — and the phone's way of
 * saying «this one»: a grey one turns the pen's colour, jumps once and a ring breathes out of it; a
 * lit one stands up a little and the same ring breathes round its stage ring.
 */
function PersonTile({ row, chosen, onOpen, onMenu }: { row: PersonRow; chosen: boolean; onOpen: (id: string) => void; onMenu: (id: string, event: MouseEvent) => void }) {
  const lit = row.look.busy;
  const name = shortName(row.name);
  const initials = initialsOf(row.name);
  const hint = [row.name, row.line, row.report, row.push].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      onContextMenu={(event) => onMenu(row.id, event)}
      aria-pressed={chosen}
      aria-label={chosen ? `${hint} — убрать карточку` : hint}
      title={hint}
      data-testid={lit || row.active > 0 ? "today-person" : "today-free-person"}
      data-person={row.id}
      data-chosen={chosen ? "" : undefined}
      className="desk-crew-tile crew-hit flex min-w-0 flex-col items-center gap-1 pb-1"
    >
      <span className="relative flex items-center justify-center" style={{ width: STAGE, height: STAGE }}>
        <span className="crew-press block" style={{ opacity: row.away && !chosen ? 0.45 : 1 }}>
          {lit ? (
            <span className="block" style={{ animation: chosen ? "crew-lift 240ms var(--ease-out) forwards" : undefined }}>
              <CrewCircle id={row.id} initials={initials} size={CIRCLE} look={row.look} />
            </span>
          ) : (
            <IdleCircle id={row.id} initials={initials} size={CIRCLE} picked={chosen} />
          )}
        </span>
        {lit && chosen ? <ChosenRing /> : null}
      </span>
      <span className={`block max-w-full truncate px-1 text-[13px] leading-4 ${chosen ? "font-semibold text-accent" : "text-text"}`}>{name}</span>
      {row.away ? <span className="block max-w-full truncate px-1 text-[11px] leading-[14px] text-muted">{row.line}</span> : null}
    </button>
  );
}

/** The phone's ring of the picked one (`IdleCircle`, D-84), out past a lit circle's own stage ring. */
function ChosenRing() {
  const size = CIRCLE + CHOSEN_OUT * 2;
  const box = { width: size, height: size, left: "50%", top: "50%", marginLeft: -size / 2, marginTop: -size / 2 };
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute rounded-full border-2 border-accent" style={box} />
      <span aria-hidden className="crew-anim pointer-events-none absolute rounded-full border-2 border-accent" style={{ ...box, animation: "pick-pulse 1.6s ease-out infinite" }} />
    </>
  );
}

/**
 * The chosen person's card under the tiles (D-164, under the tiles since D-168) — the phone's
 * `CrewCard`: who, where they are, what they are at, their open tasks from the director with the
 * stage and the deadline; a task opens in the panel, its «⋯» and right button hold every move (срок,
 * напомнить, передать, отозвать). «Дать задачу» puts the person into the order line (T); «Все дела»
 * and «Карточка» lead on; × and Esc put the card away.
 */
export function PersonHome({
  person,
  row,
  tasks,
  now,
  onGive,
  onOpenTask,
  menuOf,
  onMenu,
  onClose,
}: {
  person: Person;
  /** what the tile says about them; none while the team's load is unknown */
  row: PersonRow | null;
  tasks: readonly TaskWithPeople[];
  now: Date;
  onGive: (() => void) | null;
  onOpenTask: (id: string) => void;
  menuOf: (task: TaskWithPeople) => MenuItem[];
  onMenu: (task: TaskWithPeople, event: MouseEvent) => void;
  onClose: () => void;
}) {
  const away = person.availability !== "active";
  const extra = row ? [row.report, row.push ? `${row.push} — задачи увидит, только открыв Pulse` : null].filter(Boolean).join(" · ") : "";
  return (
    <div className="flex flex-col gap-3" data-testid="today-person-panel">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="desk-figure truncate text-[22px] leading-7" title={person.full_name}>
            {person.full_name}
          </p>
          <p className="truncate text-[13px] leading-[18px] text-muted">
            {[person.position || ROLE_LABEL[person.role], away ? AVAILABILITY_LABEL[person.availability].toLowerCase() : null].filter(Boolean).join(" · ")}
          </p>
          {row && (!away || extra) ? (
            <p className="text-[13px] leading-[18px] text-muted" data-testid="today-person-now">
              {away ? null : <Line row={row} />}
              {extra ? `${away ? "" : " · "}${extra}` : null}
            </p>
          ) : null}
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
          <Tooltip label="Убрать карточку" keys={["Esc"]} side="bottom">
            <button
              type="button"
              aria-label="Убрать карточку"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-[2px] text-[18px] leading-none text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
              data-testid="today-person-close"
            >
              ×
            </button>
          </Tooltip>
        </div>
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
