"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { RollingNumber } from "@/components/ui/RollingNumber";
import {
  CHEER_MS,
  cheerBlocked,
  cheerNext,
  cheerQueue,
  MOMENT_MS,
  momentBlocked,
  momentDue,
  momentSettles,
  momentWords,
  wallDay,
  type Cheer,
  type MomentKind,
} from "@/lib/tv/celebrate";
import type { TvEvent } from "@/lib/tv/feed";
import type { TvPace } from "@/lib/tv/queries";

import { useWallPx } from "./TvMascot";
import s from "./tv.module.css";

/**
 * Праздники стены (D-182), правила — `lib/tv/celebrate.ts`:
 *  - плашка признания внизу поверх любой сцены, 7 с: маленькое довольное лицо, имя, «+50» золотом
 *    (цифры катятся, как очки на телефоне — `RollingNumber`, D-165) и за что;
 *  - «момент» во всю стену, 8 с: рекорд дня или «обычный день сделан» — довольное лицо и искры.
 * На стене лицо бывает только спокойным, говорящим, довольным и спящим (D-45): здесь — довольное.
 * Что уже показано, стена помнит в `localStorage` (после перезапуска не повторяет); без хранилища —
 * в памяти страницы. Движение — только transform и opacity.
 */

const EASE = [0.2, 0, 0, 1] as const;
const SEEN_KEY = "pulse.tv.cheers";
const MARKS_KEY = "pulse.tv.moments";
const SEEN_KEEP = 40;

type Marks = { day: string; kinds: MomentKind[] };

function load<T>(key: string, fallback: T, remember: boolean): T {
  if (!remember || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown, remember: boolean): void {
  if (!remember) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // a kiosk profile without storage: the page remembers until its next reload
  }
}

const noop = () => () => undefined;
function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function TvCelebrate({
  events,
  guest,
  now,
  pace,
  night,
  banner,
  boardPoint,
  focus,
  board,
  remember = true,
  onBusy,
}: {
  events: readonly TvEvent[];
  guest: boolean;
  now: Date;
  pace: TvPace | null;
  /** The wall sleeps. */
  night: boolean;
  /** A notice is up over the wall. */
  banner: boolean;
  /** A meeting walks the board point by point (`board_point`). */
  boardPoint: boolean;
  /** A person or an order is on the wall. */
  focus: boolean;
  /** A board is on the wall. */
  board: boolean;
  /** The sandbox shows every case afresh: nothing kept in storage. */
  remember?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const mounted = useMounted();
  const nowMs = now.getTime();
  const day = wallDay(now);
  const [seen, setSeen] = useState<string[]>(() => load<string[]>(SEEN_KEY, [], remember));
  const [marks, setMarks] = useState<Marks>(() => load<Marks>(MARKS_KEY, { day, kinds: [] }, remember));
  const [cheer, setCheer] = useState<Cheer | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [moment, setMoment] = useState<{ kind: MomentKind; done: number } | null>(null);

  // a new day forgets yesterday's moments
  if (marks.day !== day) setMarks({ day, kinds: [] });

  // the plaques: what waits, what dropped out of a queue longer than three, what goes up now
  const seenSet = new Set(seen);
  const { queue, dropped } = cheerQueue(events, seenSet, nowMs, guest);
  const cheerDue = mounted && !cheer ? cheerNext(queue, lastAt, nowMs, cheerBlocked({ night, banner, boardPoint, moment: moment !== null })) : null;
  if (dropped.length > 0 || cheerDue) {
    const add = [...dropped, ...(cheerDue ? [cheerDue.id] : [])];
    setSeen((prev) => [...prev.filter((id) => !add.includes(id)), ...add].slice(-SEEN_KEEP));
  }
  if (cheerDue) {
    setCheer(cheerDue);
    setLastAt(nowMs);
  }

  // the moment of the day: once a day each, never over what someone put up on the wall
  const shown = new Set(marks.day === day ? marks.kinds : []);
  const blocked = momentBlocked({ night, guest, banner, focus, board, cheer: cheer !== null || cheerDue !== null });
  const momentNow = mounted && !moment && !blocked && pace ? momentDue(pace, shown) : null;
  if (momentNow && pace) {
    setMoment({ kind: momentNow, done: pace.done });
    setMarks({ day, kinds: [...shown, ...momentSettles(momentNow, pace)] });
  }

  useEffect(() => save(SEEN_KEY, seen, remember), [seen, remember]);
  useEffect(() => save(MARKS_KEY, marks, remember), [marks, remember]);

  useEffect(() => {
    if (!cheer) return;
    const timer = setTimeout(() => setCheer(null), CHEER_MS);
    return () => clearTimeout(timer);
  }, [cheer]);

  useEffect(() => {
    if (!moment) return;
    const timer = setTimeout(() => setMoment(null), MOMENT_MS);
    return () => clearTimeout(timer);
  }, [moment]);

  const busy = cheer !== null || moment !== null;
  useEffect(() => onBusy?.(busy), [busy, onBusy]);

  return (
    <>
      <AnimatePresence>{moment ? <Moment key={`moment:${moment.kind}`} kind={moment.kind} done={moment.done} /> : null}</AnimatePresence>
      <AnimatePresence>{cheer ? <Plaque key={cheer.id} cheer={cheer} /> : null}</AnimatePresence>
    </>
  );
}

/** A number that counts up from zero once it is on the wall: the roll is the point of the plaque. */
function RollUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setShown(value), 260);
    return () => clearTimeout(timer);
  }, [value]);
  return <RollingNumber value={shown} />;
}

function Plaque({ cheer }: { cheer: Cheer }) {
  const face = useWallPx(9);
  return (
    <motion.div
      className="absolute left-1/2 z-[26] flex max-w-[86vw] items-center gap-[2.6vh] rounded-[3vh] py-[2vh] pl-[2.4vh] pr-[4vh]"
      style={{
        bottom: "calc(4vh + 8vh * var(--tv-k, 1))",
        x: "-50%",
        background: "color-mix(in srgb, var(--surface-2) 96%, var(--bg))",
        boxShadow: "inset 0 0 0 0.2vh color-mix(in srgb, var(--gold) 55%, transparent), 0 2vh 6vh rgba(0,0,0,.4)",
      }}
      initial={{ opacity: 0, y: "4vh" }}
      animate={{ opacity: 1, y: "0vh" }}
      exit={{ opacity: 0, y: "2vh", transition: { duration: 0.35, ease: [0.4, 0, 1, 1] } }}
      transition={{ duration: 0.5, ease: EASE }}
      data-testid="tv-cheer"
      data-kind={cheer.kind}
    >
      <span className="shrink-0" style={{ width: "9vh", height: "9vh" }}>
        {face > 0 ? <Mascot state="happy" size={face} /> : null}
      </span>
      <div className="flex min-w-0 flex-col">
        <p className="tv-lead truncate font-bold">{cheer.name}</p>
        <p className="tv-text line-clamp-1 text-muted [overflow-wrap:anywhere]">{cheer.detail}</p>
      </div>
      {cheer.amount ? (
        <p className="tv-title ml-[1vh] shrink-0 font-bold tabular-nums" style={{ color: "var(--gold)" }}>
          +<RollUp value={cheer.amount} />
        </p>
      ) : null}
    </motion.div>
  );
}

const SPARK_COLORS = ["var(--gold)", "var(--accent)", "var(--ok)", "var(--gold)", "var(--text)"];
const SPARKS = 44;

/** Deterministic sparks: two waves out of the face along the golden angle, falling a little as they go. */
const SPARK_STYLES: CSSProperties[] = Array.from({ length: SPARKS }, (_, i) => {
  const angle = i * 2.399963;
  const reach = 22 + ((i * 37) % 30);
  const wave = i % 2;
  const round = i % 3 === 0;
  return {
    width: round ? "1.6vh" : "1.1vh",
    height: round ? "1.6vh" : "2.4vh",
    borderRadius: round ? "50%" : "0.3vh",
    background: SPARK_COLORS[i % SPARK_COLORS.length],
    "--dx": `${(Math.cos(angle) * reach * 1.5).toFixed(1)}vh`,
    "--dy": `${(Math.sin(angle) * reach + 10).toFixed(1)}vh`,
    "--rot": `${(i * 47) % 360}deg`,
    "--spark-delay": `${(wave * 3.2 + (i % 6) * 0.07).toFixed(2)}s`,
    "--spark-time": `${(2.2 + (i % 4) * 0.25).toFixed(2)}s`,
  } as CSSProperties;
});

function Moment({ kind, done }: { kind: MomentKind; done: number }) {
  const face = useWallPx(30);
  const words = momentWords(kind);
  return (
    <motion.div
      className="absolute inset-0 z-[25] flex flex-col items-center justify-center pb-[8vh]"
      style={{ background: "var(--bg)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.45 } }}
      transition={{ duration: 0.36, ease: "linear" }}
      data-testid="tv-moment"
      data-kind={kind}
    >
      <motion.div
        className="flex flex-col items-center"
        initial={{ opacity: 0, y: "3vh" }}
        animate={{ opacity: 1, y: "0vh" }}
        transition={{ duration: 0.55, ease: EASE, delay: 0.25 }}
      >
        <span className="relative" style={{ width: "30vh", height: "30vh" }}>
          <span aria-hidden className="pointer-events-none absolute inset-0">
            {SPARK_STYLES.map((style, i) => (
              <span key={i} className={s.spark} style={style} />
            ))}
          </span>
          {face > 0 ? <Mascot state="happy" size={face} /> : null}
        </span>
        <p className="tv-hero mt-[4vh] font-bold tracking-[-0.03em]">{words.title}</p>
        <p className="tv-lead mt-[2vh] text-muted">
          Сегодня принято{" "}
          <span className="font-bold tabular-nums" style={{ color: "var(--gold)" }}>
            <RollUp value={done} />
          </span>{" "}
          — {words.line}
        </p>
      </motion.div>
    </motion.div>
  );
}
