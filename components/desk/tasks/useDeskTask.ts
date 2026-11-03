"use client";

import { useEffect, useRef } from "react";

import { cardKeysFor } from "@/components/tasks/list/DirectorTaskCard";
import { latestDeclineReason, latestOpenQuestion } from "@/components/tasks/TaskThread";
import { rowKeys, type RowKey } from "@/lib/desk/tasks";
import type { BoardTask } from "@/lib/pulse/board";
import { clearTaskNotifications } from "@/lib/push/client";
import { useRecurrenceRules, type Rule } from "@/lib/recurrence/queries";
import type { DeskAction, DeskReason } from "@/lib/tasks/desk";
import { handedInPartly, isWorking, lastNudgeAt, latestSuggestion, latestTimeRequest, type Suggestion, type TimeRequest } from "@/lib/tasks/lifecycle";
import type { TaskActions } from "@/lib/tasks/mutations";
import { reasonFor } from "@/lib/tasks/overview";
import { useTaskThread, type Me, type TaskMessage, type TaskWithPeople } from "@/lib/tasks/queries";

import { useDeskActs } from "./useDeskActs";

/** What waits on a task besides its status — the board row's when there is one, else read from the thread. */
export type Signals = {
  question: string | null;
  request: TimeRequest | null;
  suggestion: Suggestion | null;
  declineReason: string | null;
  partial: boolean;
  nudgedAt: string | null;
  /** a recalled task that had been refused first keeps the refusal on its way (D-142) */
  declinedAt: string | null;
};

function signalsOf(task: TaskWithPeople | undefined, row: BoardTask | undefined, messages: TaskMessage[] | undefined): Signals {
  const working = task ? isWorking(task.status) : false;
  return {
    question: row ? row.question : latestOpenQuestion(messages),
    request: working ? (row ? (row.time_request ?? null) : latestTimeRequest(messages)) : null,
    suggestion: task?.status === "declined" ? (row ? (row.suggestion ?? null) : latestSuggestion(messages)) : null,
    declineReason: row?.decline_reason ?? latestDeclineReason(messages),
    partial: row ? Boolean(row.partial) : task ? handedInPartly(task, messages) : false,
    nudgedAt: row?.nudged_at ?? lastNudgeAt(messages),
    declinedAt:
      task?.status === "revoked"
        ? ([...(messages ?? [])].reverse().find((message) => (message.meta as Record<string, unknown> | null)?.decline_reason === true)?.created_at ?? null)
        : null,
  };
}

/**
 * One task as the desk works on it — in the right-hand panel and on the stack of «Разобрать»
 * (tasks/022 A, D-154 wave 3): the task and its thread live, what waits on it, the director's
 * buttons (the phone card's own, `cardKeysFor`) and letters (`rowKeys`), and the desk's moves
 * (`useDeskActs`: a date or a person in a popover, a word or a «sure?» in a small dialog). The
 * thread on screen is a thread read (D-61), as on the task's phone screen.
 */
export function useDeskTask({
  taskId,
  me,
  row,
  base,
  now,
  onOpenTask,
  onReply,
  afterRemove,
}: {
  taskId: string;
  me: Me;
  row: BoardTask | undefined;
  base: TaskActions;
  now: Date;
  /** «Выдать снова» and «Передать» make a new task: its toast's «Открыть» lands here */
  onOpenTask: (id: string) => void;
  /** «Ответить» (O, a question's «Ответить словами»): the caret into this task's answer field */
  onReply: () => void;
  afterRemove?: () => void;
}) {
  const { task, messages } = useTaskThread(taskId);
  const data = task.data;
  const signals = signalsOf(data, row, messages.data);
  const reason: DeskReason | null = data ? reasonFor(data, signals.question, now, Boolean(signals.request)) : null;
  const keys: DeskAction[] = data
    ? cardKeysFor(data, { question: Boolean(signals.question), request: Boolean(signals.request), suggestion: Boolean(signals.suggestion) }, now)
    : [];
  const letters: RowKey[] = data ? rowKeys(data, { request: Boolean(signals.request) }) : [];

  const acts = useDeskActs({
    base,
    tasks: data ? [data] : [],
    flagsOf: () => ({ question: signals.question, request: signals.request, suggestion: signals.suggestion }),
    now,
    companyId: me.companyId,
    onReply: () => onReply(),
    onOpen: onOpenTask,
    afterRemove: afterRemove ? () => afterRemove() : undefined,
  });

  const rules = useRecurrenceRules(Boolean(data?.recurrence_rule_id));
  const rule: Rule | null = data?.recurrence_rule_id ? (rules.data?.find((one) => one.id === data.recurrence_rule_id) ?? null) : null;

  // the thread on screen is a thread seen: the read cursor follows the newest message (D-61),
  // once per cursor — `base` is a new object every render
  const newestSeq = (messages.data ?? []).reduce((max, message) => Math.max(max, message.seq), 0);
  const companyId = me.companyId;
  const markRead = base.markRead;
  const marked = useRef("");
  useEffect(() => {
    if (newestSeq === 0) return;
    const cursor = `${taskId}:${newestSeq}`;
    if (marked.current === cursor) return;
    marked.current = cursor;
    markRead({ taskId, companyId, seq: newestSeq });
  }, [taskId, companyId, newestSeq, markRead]);
  useEffect(() => {
    clearTaskNotifications(taskId);
  }, [taskId, newestSeq]);

  return {
    task: data,
    loading: task.isLoading,
    messages: messages.data,
    messagesLoading: messages.isLoading,
    signals,
    reason,
    keys,
    letters,
    acts,
    rule,
  };
}

export type DeskTask = ReturnType<typeof useDeskTask>;
