"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, LayoutGroup, MotionConfig } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ATTENTION_LANES,
  countsOf,
  isOnBoard,
  LANE_ORDER,
  lanesOf,
  workRowLabel,
  type BoardTask,
  type Lane,
  type Lanes,
} from "@/lib/pulse/board";
import type { TaskActions } from "@/lib/tasks/mutations";
import { pruneClosed } from "@/lib/tasks/queries";
import { LaneStrip } from "./LaneStrip";
import { TaskTile } from "./TaskTile";

/** How long a closed tile stays to say goodbye before it leaves the board. */
const GOODBYE_MS = 1_400;
const WORK_OPEN_KEY = "pulse.board.work_open";

type Placement = { lane: Lane; index: number };

/** Open tiles take their current place; closing ones keep the place they had; gone ones are forgotten. */
function placeTiles(previous: Map<string, Placement>, lanes: Lanes, closing: BoardTask[]): Map<string, Placement> {
  const keep = new Set(closing.map((task) => task.id));
  const next = new Map<string, Placement>();
  for (const [id, place] of previous) if (keep.has(id)) next.set(id, place);
  for (const lane of LANE_ORDER) lanes[lane].forEach((task, index) => next.set(task.id, { lane, index }));
  return next;
}

export type LiveBoardProps = {
  rows: BoardTask[] | undefined;
  now: Date;
  /** ISO of the previous visit — rows updated after it carry the «new» mark. */
  since: string;
  actions: TaskActions;
  companyId: string;
  /** Who is reading: their own cursor decides what counts as an unread message. */
  meId: string;
  readOnly?: boolean;
  anonymized?: boolean;
};

/**
 * The board: tiles in lanes (overdue → declined → question → review), the calm «В работе»
 * lane folded into one row, a strip of counts on top. A tile changes colour and slides to
 * its new lane when its task changes; a closed one flashes its goodbye and leaves. State
 * is the board's; the assistant above only comments.
 */
export function LiveBoard({ rows, now, since, actions, companyId, meId, readOnly = false, anonymized = false }: LiveBoardProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const open = useMemo(() => (rows ?? []).filter((task) => isOnBoard(task.status)), [rows]);
  const lanes = useMemo(() => lanesOf(open, now, meId), [open, now, meId]);
  const counts = countsOf(lanes);

  // A closed row is remembered here for its goodbye, independently of the cache: the
  // refetch after the director's own «Принято» drops the row within a second, the ghost
  // stays the full GOODBYE_MS. Derived state, updated during render when new closings appear.
  const [ghosts, setGhosts] = useState<Map<string, BoardTask>>(() => new Map());
  const fresh = useMemo(() => (rows ?? []).filter((task) => !isOnBoard(task.status) && !ghosts.has(task.id)), [rows, ghosts]);
  if (fresh.length > 0) {
    const next = new Map(ghosts);
    for (const task of fresh) next.set(task.id, task);
    setGhosts(next);
  }
  // this render already counts the new ghosts: the placement map below must keep their
  // places now, not after the state update lands (the lanes memo would have moved on)
  const closed = useMemo(() => [...ghosts.values(), ...fresh], [ghosts, fresh]);
  // one goodbye timer per ghost, started once; a later ghost never restarts an earlier one
  const goodbyes = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = goodbyes.current;
    for (const id of ghosts.keys()) {
      if (timers.has(id)) continue;
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          setGhosts((current) => {
            if (!current.has(id)) return current;
            const next = new Map(current);
            next.delete(id);
            return next;
          });
          // the row a refetch has not removed yet leaves the cache too
          pruneClosed(queryClient, id);
        }, GOODBYE_MS),
      );
    }
  }, [ghosts, queryClient]);
  useEffect(() => {
    const timers = goodbyes.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // where every tile sits — remembered across renders, so a closing tile keeps its place
  // while it says goodbye (derived state: recomputed during render when the lanes change)
  const [memo, setMemo] = useState<{ lanes: Lanes; placement: Map<string, Placement> }>(() => ({ lanes, placement: placeTiles(new Map(), lanes, closed) }));
  if (memo.lanes !== lanes) setMemo({ lanes, placement: placeTiles(memo.placement, lanes, closed) });
  const placement = memo.lanes === lanes ? memo.placement : placeTiles(memo.placement, lanes, closed);
  const shown = useMemo<Lanes>(() => {
    if (closed.length === 0) return lanes;
    const copy: Lanes = { overdue: [...lanes.overdue], declined: [...lanes.declined], question: [...lanes.question], review: [...lanes.review], work: [...lanes.work] };
    for (const task of closed) {
      const place = placement.get(task.id);
      if (!place) continue;
      copy[place.lane].splice(Math.min(place.index, copy[place.lane].length), 0, task);
    }
    return copy;
  }, [lanes, closed, placement]);
  const leaving = useMemo(() => new Set(closed.map((task) => task.id)), [closed]);

  // the calm lane: folded unless nothing else is on the board; the director's choice lasts the session
  const [workOpen, setWorkOpen] = useState<boolean | null>(() => {
    try {
      const stored = window.sessionStorage.getItem(WORK_OPEN_KEY);
      return stored === null ? null : stored === "1";
    } catch {
      return null;
    }
  });
  const showWork = readOnly ? true : (workOpen ?? counts.attention === 0);
  const toggleWork = () => {
    const next = !showWork;
    setWorkOpen(next);
    try {
      window.sessionStorage.setItem(WORK_OPEN_KEY, next ? "1" : "0");
    } catch {
      // per-session convenience only
    }
  };

  if (!rows) return null;

  const tile = (task: BoardTask, lane: Lane) => (
    <TaskTile
      key={task.id}
      task={task}
      lane={lane}
      now={now}
      meId={meId}
      fresh={task.updated_at > since}
      leaving={leaving.has(task.id)}
      expanded={expanded === task.id}
      onToggle={() => setExpanded((current) => (current === task.id ? null : task.id))}
      actions={actions}
      companyId={companyId}
      readOnly={readOnly}
      anonymized={anonymized}
    />
  );

  return (
    <MotionConfig reducedMotion="user">
      <section aria-label="Доска задач" className="mt-4 flex flex-col gap-2" data-testid="board">
        <LaneStrip counts={counts} />

        <LayoutGroup>
          <AnimatePresence mode="popLayout" initial={false}>
            {LANE_ORDER.filter((lane) => ATTENTION_LANES.has(lane)).flatMap((lane) => shown[lane].map((task) => tile(task, lane)))}
          </AnimatePresence>

          {counts.work > 0 || shown.work.length > 0 ? (
            <button
              type="button"
              onClick={readOnly ? undefined : toggleWork}
              aria-expanded={showWork}
              className="mt-1 flex min-h-[44px] w-full items-center justify-between px-1 text-left text-[14px] leading-4 text-muted"
            >
              <span>{workRowLabel(counts.work)}</span>
              {readOnly ? null : <span aria-hidden>{showWork ? "▴" : "▾"}</span>}
            </button>
          ) : null}

          <AnimatePresence mode="popLayout" initial={false}>
            {showWork ? shown.work.map((task) => tile(task, "work")) : null}
          </AnimatePresence>
        </LayoutGroup>
      </section>
    </MotionConfig>
  );
}
