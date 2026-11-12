"use client";

import { ClipboardCheck, ClipboardX, Sparkles, ListChecks, BellOff } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import type { Group } from "@/components/desk/ui/DataGrid";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import type { TeamDayRow } from "@/lib/daily-report/types";
import { formatNum } from "@/lib/desk/format";
import { hashOf, initialsOf } from "@/lib/idle/people";
import type { Load } from "@/lib/people/loads";
import { ROLE_LABEL, type Person } from "@/lib/people/queries";
import type { Health } from "@/lib/push/health";

import { loadWords } from "./shared";

/** What a tile says besides the name, the director's: the load, today's report, the points, the channel. */
export type TileFacts = {
  load?: Load;
  report?: TeamDayRow;
  /** null — no points game, or not this person's (the director, the wall) */
  balance: number | null;
  push?: Health;
};

/** The state of a person as their circle's ring says it — the colours of «Задачи». */
export type TileState = "gone" | "away" | "late" | "review" | "work" | "free" | "quiet";

export function tileState(person: Person, load: Load | undefined, crew: boolean): TileState {
  if (!person.is_active) return "gone";
  if (!crew) return "quiet";
  if (person.availability !== "active") return "away";
  if ((load?.overdue ?? 0) > 0) return "late";
  if ((load?.review ?? 0) > 0) return "review";
  if ((load?.active ?? 0) > 0) return "work";
  return "free";
}

const STATE_WORD: Record<TileState, string> = {
  gone: "ушёл из команды",
  away: "не на месте",
  late: "есть просрочка",
  review: "работа ждёт приёмки",
  work: "в работе",
  free: "свободен",
  quiet: "",
};

/** A person's circle (D-172): the photo, or the initials on a soft gradient of their own hue. */
export function TileFace({ person, size, state }: { person: Pick<Person, "id" | "full_name" | "avatar_url">; size: number; state?: TileState }) {
  const [broken, setBroken] = useState<string | null>(null);
  const url = person.avatar_url && person.avatar_url !== broken ? person.avatar_url : null;
  const hue = hashOf(person.id, 7) % 360;
  return (
    <span className="team-face" data-state={state} style={{ width: size, height: size, "--h": hue } as CSSProperties}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a profile photo from the public bucket
        <img src={url} alt="" decoding="async" onError={() => setBroken(url)} className="team-face-photo" />
      ) : (
        <span className="team-face-initials" style={{ fontSize: Math.round(size * 0.36) }}>
          {initialsOf(person.full_name)}
        </span>
      )}
    </span>
  );
}

/**
 * One person as a tile of the grid (D-172): the circle with its ring in the colour of their state,
 * the name and the position, and — for the director — three small facts under them: the open work,
 * today's report, the points. A click opens the card under the row, a double click the full card.
 */
function PersonTile({
  person,
  director,
  crew,
  facts,
  chosen,
  open,
  onClick,
  onDouble,
}: {
  person: Person;
  director: boolean;
  crew: boolean;
  facts: TileFacts;
  chosen: boolean;
  open: boolean;
  onClick: () => void;
  onDouble: () => void;
}) {
  const state = tileState(person, facts.load, crew);
  const position = person.position && person.position.toLowerCase() !== ROLE_LABEL[person.role].toLowerCase() ? person.position : ROLE_LABEL[person.role];
  const active = facts.load?.active ?? 0;
  const overdue = facts.load?.overdue ?? 0;
  const deaf = facts.push && (facts.push.state === "off" || facts.push.state === "broken");
  const report = facts.report;
  const word = STATE_WORD[state];
  return (
    <button
      type="button"
      data-row-key={person.id}
      data-testid="desk-team-tile"
      data-state={state}
      data-chosen={chosen ? "" : undefined}
      data-open={open ? "" : undefined}
      aria-pressed={open}
      aria-label={[person.full_name, position, word].filter(Boolean).join(" · ")}
      title={director && crew ? loadWords(facts.load) : undefined}
      onClick={onClick}
      onDoubleClick={onDouble}
      className="team-tile"
    >
      <span className="team-tile-face">
        <TileFace person={person} size={60} state={state} />
        {open ? <span aria-hidden className="team-tile-pulse" /> : null}
        {director && crew && overdue > 0 ? (
          <span className="team-tile-badge" data-tone="danger" aria-hidden>
            {overdue}
          </span>
        ) : null}
      </span>
      <span className="team-tile-name" title={person.full_name}>
        {person.full_name}
      </span>
      <span className="team-tile-role">{person.is_active ? (person.availability !== "active" && person.role !== "tv" ? (person.availability === "vacation" ? "в отпуске" : "на больничном") : position) : "ушёл"}</span>
      {director && crew && person.is_active ? (
        <span className="team-tile-facts">
          {active > 0 ? (
            <span className="team-fact" data-tone={overdue > 0 ? "danger" : "ok"} title={loadWords(facts.load)}>
              <ListChecks size={13} strokeWidth={2.25} aria-hidden />
              <span className="nums">{active}</span>
            </span>
          ) : null}
          {report && report.state !== "off" && report.state !== "away" ? (
            <span
              className="team-fact"
              data-tone={report.state === "submitted" ? "ok" : report.state === "missed" ? "danger" : "muted"}
              title={report.state === "submitted" ? "Отчёт за сегодня сдан" : report.state === "missed" ? "Отчёт за сегодня не сдан" : "Отчёт за сегодня ещё не сдан"}
            >
              {report.state === "missed" ? <ClipboardX size={13} strokeWidth={2.25} aria-hidden /> : <ClipboardCheck size={13} strokeWidth={2.25} aria-hidden />}
              <span>{report.state === "submitted" ? "сдан" : report.state === "missed" ? "нет" : "ждём"}</span>
            </span>
          ) : null}
          {facts.balance !== null ? (
            <span className="team-fact" data-tone="gold" title="Очки">
              <Sparkles size={13} strokeWidth={2.25} aria-hidden />
              <span className="nums">{formatNum(facts.balance)}</span>
            </span>
          ) : null}
          {deaf ? (
            <span className="team-fact" data-tone="muted" title={`Уведомления: ${facts.push?.text ?? "не включены"}`}>
              <BellOff size={13} strokeWidth={2.25} aria-hidden />
            </span>
          ) : null}
        </span>
      ) : !director && deaf ? (
        <span className="team-tile-facts">
          <span className="team-fact" data-tone="muted">
            <BellOff size={13} strokeWidth={2.25} aria-hidden />
            <span>без уведомлений</span>
          </span>
        </span>
      ) : null}
    </button>
  );
}

/** The grid while the team loads: tiles of the real size, nothing moves when they come. */
export function TilesBone({ count = 10 }: { count?: number }) {
  return (
    <SkeletonGroup grow className="team-grid">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="team-tile team-tile-bone">
          <Bone round w={60} h={60} />
          <Bone h={14} w="70%" className="mt-3" />
          <Bone h={12} w="45%" className="mt-1.5" />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** How many tiles stand in a row of this grid now: the card goes after the last of the chosen one's row. */
function useColumns(): [(node: HTMLDivElement | null) => void, number, HTMLDivElement | null] {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(0);
  useLayoutEffect(() => {
    if (!node) return;
    const measure = () => setColumns(getComputedStyle(node).gridTemplateColumns.split(" ").filter(Boolean).length);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, columns, node];
}

/** A group of the grid: its title, its tiles, and the open person's card right under their row. */
function Section({
  group,
  director,
  crew,
  factsOf,
  chosenId,
  openId,
  card,
  onOpen,
  onCard,
}: {
  group: Group<Person>;
  director: boolean;
  crew: (person: Person) => boolean;
  factsOf: (person: Person) => TileFacts;
  chosenId: string | null;
  openId: string | null;
  card: ReactNode;
  onOpen: (id: string) => void;
  onCard: (id: string) => void;
}) {
  const [ref, columns, node] = useColumns();
  const sheet = useRef<HTMLDivElement | null>(null);
  const at = openId ? group.rows.findIndex((person) => person.id === openId) : -1;
  // the last tile of the open one's row: the card stands after it, across the whole grid
  const rowEnd = at < 0 ? -1 : Math.min(group.rows.length - 1, columns > 0 ? Math.floor(at / columns) * columns + columns - 1 : at);

  // the card's notch over the open tile, wherever the row has wrapped it
  useLayoutEffect(() => {
    const frame = sheet.current;
    if (!frame || !node || !openId) return;
    const place = () => {
      const tile = node.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(openId)}"]`);
      if (!tile) return;
      const a = tile.getBoundingClientRect();
      const b = frame.getBoundingClientRect();
      frame.style.setProperty("--caret-x", `${Math.round(a.left + a.width / 2 - b.left)}px`);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, openId, rowEnd, columns]);

  if (group.rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" data-testid={`desk-team-group-${group.key}`}>
      {group.title ? (
        <p className="team-group-title">
          {group.title}
          <span className="nums">{group.rows.length}</span>
        </p>
      ) : null}
      <div ref={ref} className="team-grid" role="list" aria-label={typeof group.title === "string" ? group.title : "Команда"}>
        {group.rows.map((person, index) => (
          <FragmentWithCard key={person.id} after={index === rowEnd ? <div ref={sheet} className="team-card-slot" data-testid="team-card-slot">{card}</div> : null}>
            <div role="listitem" className="contents">
              <PersonTile
                person={person}
                director={director}
                crew={crew(person)}
                facts={factsOf(person)}
                chosen={chosenId === person.id}
                open={openId === person.id}
                onClick={() => onOpen(person.id)}
                onDouble={() => onCard(person.id)}
              />
            </div>
          </FragmentWithCard>
        ))}
      </div>
    </section>
  );
}

function FragmentWithCard({ children, after }: { children: ReactNode; after: ReactNode }) {
  return (
    <>
      {children}
      {after}
    </>
  );
}

/**
 * «Команда» as a grid (D-172): the groups of the table — the team, the directors and the wall, who
 * left — each a grid of tiles; the open person's card (`card`) under the row of their tile. The
 * right button on a tile is the row's menu, as in the table.
 */
export function TeamGrid({
  groups,
  director,
  crew,
  factsOf,
  chosenId,
  openId,
  card,
  onOpen,
  onCard,
  onMenu,
}: {
  groups: Group<Person>[];
  director: boolean;
  crew: (person: Person) => boolean;
  factsOf: (person: Person) => TileFacts;
  chosenId: string | null;
  openId: string | null;
  card: ReactNode;
  onOpen: (id: string) => void;
  onCard: (id: string) => void;
  onMenu: (id: string, event: MouseEvent) => void;
}) {
  return (
    <div
      className="flex flex-col gap-6"
      data-testid="desk-team-grid"
      onContextMenu={(event) => {
        const id = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]")?.dataset.rowKey;
        if (id) onMenu(id, event);
      }}
    >
      {groups.map((group) => (
        <Section
          key={group.key}
          group={group}
          director={director}
          crew={crew}
          factsOf={factsOf}
          chosenId={chosenId}
          openId={openId}
          card={openId && group.rows.some((person) => person.id === openId) ? card : null}
          onOpen={onOpen}
          onCard={onCard}
        />
      ))}
    </div>
  );
}
