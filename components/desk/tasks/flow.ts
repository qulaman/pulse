"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

import { inPlaceOf, widthBucket } from "@/lib/desk/tasks";
import type { TaskActions } from "@/lib/tasks/mutations";

import type { PanelNext } from "./TaskPanel";

/** The address of a desk screen, written without a navigation: `?tab`, `?who`, `?status`, `?due`, `?group`, `?q`, `?id` (D-153 §1). */
export function writeParams(patch: Record<string, string | null>) {
  const next = new URLSearchParams(window.location.search);
  for (const [name, value] of Object.entries(patch)) {
    if (value === null || value === "") next.delete(name);
    else next.set(name, value);
  }
  const text = next.toString();
  window.history.replaceState(null, "", text ? `${window.location.pathname}?${text}` : window.location.pathname);
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
