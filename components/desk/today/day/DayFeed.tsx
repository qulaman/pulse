"use client";

import { Activity, CalendarDays, Check, CheckCheck, CircleCheck, Clock, Gift, Inbox, Megaphone, Play, Send, Sparkles, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { AQTOBE_OFFSET_MS, aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { reachOf, splitEther } from "@/lib/desk/ether";
import { shortWhen } from "@/lib/desk/home";
import { loadStateOf } from "@/lib/desk/tasks";
import { useEther, useHeldAnnouncements, type Announcement } from "@/lib/ether/queries";
import { shortName } from "@/lib/people/names";
import { isTeamMember, usePeople, type Person as TeamPerson } from "@/lib/people/queries";
import { lineOf, type TvEvent, type TvKind, type TvLine } from "@/lib/tv/feed";

import { BlockNote, RowsBone } from "../home/parts";
import { Bar, Card, DayList, Ghost, Head, Mark, Person, Pill, toneOf, Unfold, useArrivals, type Ink } from "./kit";

/*
 * «Лента дня» (D-196): «Эфир» and «Лента» of the desk's «Сегодня» as one block — the working day as
 * a line with a dot for each move of the company, the announcement that matters pinned over the
 * day's moves with its reach, the moves themselves on an axis below.
 */

/** What a move of the day is about, at a glance: its icon and its ink — the colours of the stages. */
const FEED_KIND: Record<TvKind, { icon: LucideIcon; ink: Ink }> = {
  task_sent: { icon: Send, ink: "sky" },
  task_accepted: { icon: Play, ink: "ok" },
  task_review: { icon: Inbox, ink: "pen" },
  task_done: { icon: CircleCheck, ink: "ok" },
  points: { icon: Sparkles, ink: "gold" },
  announcement: { icon: Megaphone, ink: "pen" },
  merch: { icon: Gift, ink: "gold" },
  event: { icon: CalendarDays, ink: "sky" },
};

const TASK_KINDS: ReadonlySet<TvKind> = new Set(["task_sent", "task_accepted", "task_review", "task_done"]);

/** How many moves of the day stand in the card before «ещё N — вся лента». */
const SHOWN = 8;
/** The company moved this recently: the plate's corner beats. */
const RECENT_MS = 5 * 60_000;

/* -------------------------------------------------------------------------------------------- */
/* The day's pulse line                                                                           */
/* -------------------------------------------------------------------------------------------- */

const DAY_FROM = 8 * 60;
const DAY_TO = 19 * 60;
const TICKS = [8, 11, 14, 17, 19] as const;

/** Minutes since midnight on the Aqtobe wall clock (a fixed +05:00). */
function minuteOf(at: Date): number {
  return Math.floor((at.getTime() + AQTOBE_OFFSET_MS) / 60_000) % 1440;
}
/** Where a minute of the day stands on the 08–19 line, clamped to its ends. */
function spot(minute: number): string {
  return `${(Math.max(0, Math.min(1, (minute - DAY_FROM) / (DAY_TO - DAY_FROM))) * 100).toFixed(2)}%`;
}

/** The working day as a line: each move of the company a dot at its time in its ink, a stroke at now. Nothing loops. */
function PulseLine({ lines, now }: { lines: readonly TvLine[]; now: Date }) {
  const nowAt = spot(minuteOf(now));
  return (
    <div className="day-pulse" role="img" aria-label={`События дня по времени: ${lines.length}`} data-testid="today-feed-pulse">
      <span className="day-pulse-axis" />
      <span className="day-pulse-past" style={{ width: nowAt }} />
      {lines.map((line) => (
        <span
          key={line.id}
          className="day-pulse-dot"
          style={{ ...toneOf(FEED_KIND[line.kind].ink), left: spot(minuteOf(line.at)) }}
          title={`${shortWhen(line.at, now)} · ${wordsOf(line)}`}
        />
      ))}
      <span className="day-pulse-now" style={{ left: nowAt }} />
      {TICKS.map((hour) => (
        <span key={hour} className="day-pulse-tick" style={{ left: spot(hour * 60) }}>
          {hour}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* The block                                                                                      */
/* -------------------------------------------------------------------------------------------- */

/** The announcement on top: the one waiting for the delivery window (with the moment it goes), else today's last. */
type Pin = { item: Announcement; until: string | null };

const squash = (text: string | null | undefined) => (text ?? "").trim().replace(/\s+/g, " ");

/**
 * The wall's line of an announcement is born with it, in one transaction (tv_events_announcement):
 * the same moment, its words squashed and cut to 120 with «…» (lib/tv/feed). Both must agree — two
 * announcements of one second are told apart by their words.
 */
function isLineOf(line: TvLine, item: Announcement): boolean {
  if (line.kind !== "announcement") return false;
  if (Math.abs(line.at.getTime() - new Date(item.created_at).getTime()) > 5_000) return false;
  const words = squash(item.transcript);
  const detail = line.detail ?? "";
  return detail.endsWith("…") ? words.startsWith(detail.slice(0, -1)) : words === detail;
}

/** A line's words, nominal — a name gives no gender: «новая задача», «готово», «очки». */
function wordsOf(line: TvLine): string {
  return line.kind === "points" && line.amount ? "очки" : line.label.charAt(0).toLowerCase() + line.label.slice(1);
}

export function DayFeed({
  events,
  loading,
  failed,
  note,
  now,
  taskOf,
  onOpenTask,
  onAnnounce,
  index,
}: {
  events: readonly TvEvent[];
  loading: boolean;
  failed: boolean;
  note: ReactNode;
  now: Date;
  taskOf: (title: string | null) => string | null;
  onOpenTask: (id: string) => void;
  onAnnounce: () => void;
  index: number;
}) {
  const { role } = useDeskScope();
  const director = role === "director";
  const ether = useEther();
  // only the director reads the outbox (RLS): what still waits for the window
  const held = useHeldAnnouncements(director);
  const people = usePeople();
  const etherLoad = loadStateOf(ether);

  const team = useMemo(() => (people.data ? people.data.filter(isTeamMember) : null), [people.data]);
  // the wall knows a name, not an id: a unique name still finds its photo
  const idByName = useMemo(() => {
    const ids = new Map<string, string | null>();
    for (const person of people.data ?? []) ids.set(person.full_name, ids.has(person.full_name) ? null : person.id);
    return ids;
  }, [people.data]);

  // the wall keeps its last few whatever their day; the desk's day is today's only (D-154)
  const today = useMemo(() => {
    const day = aqtobeDay(now);
    return events.map((event) => lineOf(event, false)).filter((line) => aqtobeDay(line.at) === day);
  }, [events, now]);

  const pin = useMemo<Pin | null>(() => {
    const parts = splitEther(ether.data ?? [], held.data, now);
    const waiting = parts.held[0];
    if (waiting) return { item: waiting.item, until: waiting.until };
    const last = parts.sent[0];
    return last && aqtobeDay(new Date(last.created_at)) === aqtobeDay(now) ? { item: last, until: null } : null;
  }, [ether.data, held.data, now]);

  // the pinned announcement is not told twice: its own line of the wall leaves the list
  const rows = useMemo(() => (pin ? today.filter((line) => !isLineOf(line, pin.item)) : today), [today, pin]);

  const recent = today.some((line) => now.getTime() - line.at.getTime() < RECENT_MS);

  // «Объявить»: each press plays two arcs out of the megaphone, once
  const [arcs, setArcs] = useState(0);

  const ready = !loading && !failed;
  const quiet = ready && rows.length === 0 && !pin && etherLoad.kind !== "loading" && etherLoad.kind !== "failed";

  return (
    <Card ink="sky" index={index} testId="today-feed">
      {/* the corner beats as the first move of five minutes comes; the head is never re-mounted for
          the next one — that would take the keyboard's focus off «Объявить» under the director's hand */}
      <Head icon={Activity} sign="ether" title="Лента дня" href="/desk/ether" corner={recent ? "news" : null}>
        {director ? (
          <Ghost
            icon={Megaphone}
            pen
            arcs={arcs}
            onPress={() => {
              setArcs((n) => n + 1);
              onAnnounce();
            }}
            title="Строка поручения начнётся со слова «всем»"
            testId="home-ether-announce"
          >
            Объявить
          </Ghost>
        ) : null}
      </Head>
      {failed ? null : <PulseLine lines={today} now={now} />}
      {note}
      <BlockNote state={etherLoad} failed="Эфир не загрузился" now={now} onRetry={() => void ether.refetch()} />
      {etherLoad.kind === "loading" ? null : <Pinned pin={pin} team={team} now={now} />}
      {loading ? (
        <RowsBone rows={4} height={34} />
      ) : ready ? (
        <FeedRows rows={rows} now={now} ether={ether.data} idByName={idByName} taskOf={taskOf} onOpenTask={onOpenTask} />
      ) : null}
      {quiet ? (
        <p className="py-2 text-[13px] leading-5" data-testid="today-feed-empty">
          <span className="font-medium">Пока тихо</span>
          {director ? <span className="day-muted block text-[12px] leading-4">Начните поручение со слова «всем» — его получит вся команда</span> : null}
        </p>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* The pinned announcement                                                                        */
/* -------------------------------------------------------------------------------------------- */

const UNFOLD = { height: { duration: 0.23, ease: [0.2, 0.8, 0.2, 1] }, opacity: { duration: 0.19, delay: 0.04 } } as const;
const FOLD = { height: { duration: 0.16, ease: [0.4, 0, 1, 1] }, opacity: { duration: 0.12 } } as const;

/**
 * Mounted once the announcements are in: what stands then is the first paint and stays still; a
 * pin that comes later unfolds, a new announcement in its place lights once.
 */
function Pinned({ pin, team, now }: { pin: Pin | null; team: readonly TeamPerson[] | null; now: Date }) {
  const fresh = useArrivals(pin ? [pin.item.id] : []);
  return (
    <AnimatePresence initial={false}>
      {pin ? (
        <motion.div
          key="pin"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1, transition: UNFOLD }}
          exit={{ height: 0, opacity: 0, transition: FOLD }}
          style={{ overflow: "hidden" }}
        >
          <Link
            key={pin.item.id}
            href={`/desk/ether?id=${encodeURIComponent(pin.item.id)}`}
            prefetch={false}
            className="day-pinned"
            title={pin.item.transcript}
            data-testid="home-ether-row"
            data-held={pin.until ? "" : undefined}
            data-fresh={fresh.has(pin.item.id) ? "" : undefined}
          >
            <span className="pt-0.5">
              <Mark icon={Megaphone} ink="pen" size={16} />
            </span>
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="line-clamp-2 text-[13px] leading-5 [overflow-wrap:anywhere]">{pin.item.transcript}</span>
              <span className="day-muted flex min-w-0 items-center gap-2 text-[12px]">
                <span className="nums">{shortWhen(new Date(pin.item.created_at), now)}</span>
                {pin.until ? <Held until={pin.until} now={now} /> : <Reach item={pin.item} team={team} />}
              </span>
            </span>
          </Link>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Waits for the delivery window (D-38): when it goes, in the pen — the director may send it now in «Эфир». */
function Held({ until, now }: { until: string; now: Date }) {
  const words = humanAqtobe(new Date(until), now);
  return (
    <span title={`Ждёт окна доставки: уйдёт ${words} — отправить сейчас можно в «Эфире»`}>
      <Pill ink="pen" icon={Clock}>
        уйдёт {words.split(" ").at(-1)}
      </Pill>
    </span>
  );
}

/**
 * Reach among the people working now — «3 из 9», never «10 из 9» (an ack of somebody since gone
 * counts for nobody); all of them — a double tick. The team not loaded yet — the count alone.
 */
function Reach({ item, team }: { item: Announcement; team: readonly TeamPerson[] | null }) {
  const reach = team ? reachOf(item.acks, team) : null;
  if (!reach || reach.of === 0) {
    return (
      <span className="nums inline-flex items-center gap-1" data-testid="home-ether-reach">
        <Check size={14} aria-hidden />
        ознакомились: {item.acks.length}
      </span>
    );
  }
  if (reach.seen >= reach.of) {
    return (
      <span className="inline-flex items-center gap-1" style={{ color: "var(--ok-ink)" }} title="Ознакомились все" data-testid="home-ether-reach">
        <CheckCheck size={14} aria-hidden /> ознакомились все
      </span>
    );
  }
  return (
    <span
      className="inline-flex min-w-0 items-center gap-2"
      title={`Не ознакомились: ${reach.missing.map((person) => shortName(person.full_name)).join(", ")}`}
      data-testid="home-ether-reach"
    >
      <Bar value={reach.seen} of={reach.of} ink="ok" className="w-16 shrink-0" />
      <span className="nums truncate">
        {reach.seen} из {reach.of} ознакомились
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------------------------- */
/* The day's moves                                                                                */
/* -------------------------------------------------------------------------------------------- */

/**
 * Mounted once the wall's feed is in, so the rows standing then are the first paint and stand still;
 * a move that comes later unfolds the card and lights «только что». A line about a task the
 * director gave opens it (the wall's event carries no id: the task is found by its title among his
 * own); an announcement opens in «Эфир».
 */
function FeedRows({
  rows,
  now,
  ether,
  idByName,
  taskOf,
  onOpenTask,
}: {
  rows: readonly TvLine[];
  now: Date;
  ether: readonly Announcement[] | undefined;
  idByName: ReadonlyMap<string, string | null>;
  taskOf: (title: string | null) => string | null;
  onOpenTask: (id: string) => void;
}) {
  const ids = useMemo(() => rows.map((line) => line.id), [rows]);
  const fresh = useArrivals(ids);
  const more = rows.length - SHOWN;
  return (
    <div className="day-feed-scroll">
      <DayList testId="today-feed-list">
        {rows.slice(0, SHOWN).map((line) => {
          const kind = FEED_KIND[line.kind];
          const points = line.kind === "points" && line.amount ? `+${line.amount}` : null;
          const words = wordsOf(line);
          const detail = line.detail ? ` «${line.detail}»` : "";
          const name = shortName(line.name);
          const body = (
            <>
              <span className="day-when">{now.getTime() - line.at.getTime() < 60_000 ? "сейчас" : shortWhen(line.at, now)}</span>
              <span className="day-axis" style={toneOf(kind.ink)}>
                <i />
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <Person id={idByName.get(line.name) ?? null} name={line.name} size={20} />
                <span className="min-w-0 truncate" title={`${name} · ${words}${detail}`}>
                  {name}
                  <span className="day-muted">
                    {" "}
                    · {words}
                    {detail}
                  </span>
                </span>
              </span>
              {points ? (
                <Pill ink="gold" icon={Sparkles}>
                  {points}
                </Pill>
              ) : (
                <Mark icon={kind.icon} ink={kind.ink} title={line.label} />
              )}
            </>
          );
          const shared = {
            className: "day-row day-feed-row",
            "data-testid": "today-feed-row",
            "data-kind": line.kind,
            "data-fresh": fresh.has(line.id) ? "" : undefined,
          };
          const taskId = TASK_KINDS.has(line.kind) ? taskOf(line.detail) : null;
          const said = line.kind === "announcement" ? ether?.find((item) => isLineOf(line, item)) : undefined;
          return (
            <Unfold key={line.id}>
              {taskId ? (
                <button type="button" {...shared} data-task="" onClick={() => onOpenTask(taskId)}>
                  {body}
                </button>
              ) : line.kind === "announcement" ? (
                <Link href={said ? `/desk/ether?id=${encodeURIComponent(said.id)}` : "/desk/ether"} prefetch={false} {...shared}>
                  {body}
                </Link>
              ) : (
                <div {...shared}>{body}</div>
              )}
            </Unfold>
          );
        })}
        {more > 0 ? (
          <Unfold key="more">
            <Link href="/desk/ether" prefetch={false} className="day-row day-muted" style={{ gridTemplateColumns: "1fr" }} data-testid="today-feed-more">
              ещё {more} — вся лента
            </Link>
          </Unfold>
        ) : null}
      </DayList>
    </div>
  );
}
