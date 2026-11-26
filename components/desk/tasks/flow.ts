"use client";

import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";

import { writeDeskAddress } from "@/components/desk/DeskAddress";
import { withParams } from "@/lib/desk/address-state";
import { inPlaceOf, widthBucket } from "@/lib/desk/tasks";
import type { BoardTask } from "@/lib/pulse/board";
import type { DeskReason } from "@/lib/tasks/desk";
import type { TaskActions } from "@/lib/tasks/mutations";
import { reasonFor } from "@/lib/tasks/overview";
import type { TaskWithPeople } from "@/lib/tasks/queries";

import type { PanelNext } from "./TaskPanel";

/**
 * The address of a desk screen, written without a navigation: `?tab`, `?who`, `?status`, `?due`,
 * `?group`, `?q`, `?id` (D-153 §1) — through the desk's address (D-184), so what it changes can
 * move: `options` are `writeDeskAddress`'s (a transition type, a write from the keys).
 */
export function writeParams(patch: Record<string, string | null>, options?: Parameters<typeof writeDeskAddress>[1]) {
  writeDeskAddress(withParams(window.location.pathname, window.location.search.slice(1), patch), options);
}

/**
 * The width bucket of an element (`widthBucket`), kept up to date while the window or the panel
 * changes it. Only a new bucket redraws: dragging the panel's edge between two floors costs nothing.
 */
export function useWidthBucket(ref: RefObject<HTMLElement | null>): number {
  const [bucket, setBucket] = useState(Number.POSITIVE_INFINITY);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = (width: number) => {
      if (width > 0) setBucket(widthBucket(width));
    };
    measure(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return bucket;
}

/**
 * The same actions, each telling `mark` which task it moved — the panel's own moves (D-154): a
 * task that leaves its list right after the director's move hands the panel to the next one, a
 * task that leaves for somebody else's reason does not. The read cursor is not a move.
 */
export function taggedActions(base: TaskActions, mark: (taskId: string) => void): TaskActions {
  return {
    ...base,
    transition: (input) => {
      mark(input.taskId);
      base.transition(input);
    },
    revoke: (taskId) => {
      mark(taskId);
      base.revoke(taskId);
    },
    sendNow: (taskId) => {
      mark(taskId);
      base.sendNow(taskId);
    },
    extend: (input) => {
      mark(input.taskId);
      base.extend(input);
    },
    reassign: (input) => {
      mark(input.taskId);
      base.reassign(input);
    },
    edit: (input) => {
      mark(input.taskId);
      base.edit(input);
    },
    answerTime: (input) => {
      mark(input.taskId);
      base.answerTime(input);
    },
    nudge: (input) => {
      mark(input.taskId);
      base.nudge(input);
    },
    sendMessage: (input) => {
      mark(input.taskId);
      base.sendMessage(input);
    },
    remove: (taskId) => {
      mark(taskId);
      base.remove(taskId);
    },
    reissue: (input) => {
      mark(input.task.id);
      base.reissue(input);
    },
  };
}

/**
 * The panel over a list (D-154): after the director's own move the open task leaves the list and
 * the panel goes on to the one now standing in its place; a task that left for another reason
 * says «Готово · следующая →», and the last one says the list is empty. `mark` — hand it to
 * `taggedActions`.
 */
export function usePanelFlow(ids: readonly string[], openId: string | null, openTask: (id: string) => void) {
  const [anchor, setAnchor] = useState<{ id: string; index: number } | null>(null);
  const [acted, setActed] = useState<string | null>(null);
  const at = openId ? ids.indexOf(openId) : -1;
  if (openId && at >= 0 && (anchor?.id !== openId || anchor.index !== at)) setAnchor({ id: openId, index: at });
  const gone = Boolean(openId) && at < 0 && anchor !== null && anchor.id === openId;
  const inPlace = gone && anchor ? inPlaceOf(ids, anchor.index) : null;
  const advance = Boolean(openId && gone && inPlace && acted === openId);
  useEffect(() => {
    if (advance && inPlace) openTask(inPlace);
  }, [advance, inPlace, openTask]);
  const next: PanelNext | null = openId && gone && !advance ? { id: acted === openId ? null : inPlace, onGo: () => inPlace && openTask(inPlace) } : null;
  return { next, mark: setActed };
}

/**
 * The board as one director's lists read it (D-154): `rows` — his own (only the author's answer
 * closes a question), `boardById` — every row of the company, `reasons` — why each of his tasks
 * waits on him (`reasonFor`). Kept by identity while nothing under them changes.
 */
export function useDirectorBoard(board: readonly BoardTask[], all: readonly TaskWithPeople[], meId: string, now: Date) {
  const rows = useMemo(() => {
    const map = new Map<string, BoardTask>();
    for (const row of board) if (row.author_id === meId) map.set(row.id, row);
    return map;
  }, [board, meId]);
  const boardById = useMemo(() => new Map(board.map((row) => [row.id, row])), [board]);
  const reasons = useMemo(() => {
    const map = new Map<string, DeskReason>();
    for (const task of all) {
      const row = rows.get(task.id);
      const reason = reasonFor(task, row?.question, now, Boolean(row?.time_request));
      if (reason) map.set(task.id, reason);
    }
    return map;
  }, [all, rows, now]);
  return { rows, boardById, reasons };
}
