"use client";

import { useCallback, useInsertionEffect, useRef, useState } from "react";

import type { TaskActions } from "@/lib/tasks/mutations";

/**
 * A handler that keeps its identity across renders and always runs the latest version of `fn` —
 * for the props of the memoised parts of Пульс and Лента (D-178): a new arrow every render made
 * every part render again on every tap. The latest `fn` is taken before any layout effect runs,
 * so a child calling it from its own layout effect gets this render's. Not for use during render.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  useInsertionEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}

/**
 * The task actions under one identity for the whole life of the screen: `useTaskActions` builds a
 * new object every render, and the deck, the thread and the cards took it as a new prop on every
 * tap. Each method calls the latest one; `busy` is read live.
 */
export function useStableActions(actions: TaskActions): TaskActions {
  const latest = useRef(actions);
  useInsertionEffect(() => {
    latest.current = actions;
  });
  const [stable] = useState<TaskActions>(() => ({
    transition: (input) => latest.current.transition(input),
    complete: (input) => latest.current.complete(input),
    revoke: (taskId) => latest.current.revoke(taskId),
    sendNow: (taskId) => latest.current.sendNow(taskId),
    extend: (input) => latest.current.extend(input),
    reassign: (input) => latest.current.reassign(input),
    requestTime: (input) => latest.current.requestTime(input),
    answerTime: (input) => latest.current.answerTime(input),
    nudge: (input) => latest.current.nudge(input),
    sendMessage: (input) => latest.current.sendMessage(input),
    remove: (taskId) => latest.current.remove(taskId),
    reissue: (input) => latest.current.reissue(input),
    markRead: (input) => latest.current.markRead(input),
    get busy() {
      return latest.current.busy;
    },
  }));
  return stable;
}
