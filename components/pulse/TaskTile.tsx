"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

import { TaskCard } from "@/components/tasks/TaskCard";
import { ReworkSheet } from "@/components/tasks/TaskSheets";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { haptic } from "@/lib/haptics";
import { Composer } from "@/components/tasks/thread/Composer";
import { ThreadTail } from "@/components/tasks/thread/ThreadTail";
import { LANE_WORD, messageOf, whoOf, type BoardTask, type Lane } from "@/lib/pulse/board";
import { untilWords } from "@/lib/tasks/lifecycle";
import type { TaskActions } from "@/lib/tasks/mutations";
import { BUTTON, TEXT } from "@/lib/tasks/status-text";

type Tone = "danger" | "warn" | "ok" | "accent" | "gold" | "muted";

const TONE_VAR: Record<Tone, string> = {
  danger: "var(--danger)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  accent: "var(--accent)",
  gold: "var(--gold)",
  muted: "var(--text-muted)",
};

/** One colour per lane — the rail, the tint and the lane word all say the same thing. */
const LANE_TONE: Record<Lane, Tone> = {
  overdue: "danger",
  declined: "danger",
  question: "warn",
  review: "ok",
  work: "accent",
};

/** Quick answers of the swipe table (FRONTEND «Вопросы»); anything longer — in the thread. */
const QUICK_ANSWERS = ["Да", "Нет", "Позже", "Действуй сам"] as const;

export type TaskTileProps = {
  task: BoardTask;
  lane: Lane;
  now: Date;
  /** Changed since the director's last visit — a small mark by the name. */
  fresh: boolean;
  /** The task has just closed: the tile shows its goodbye (gold for done) before it leaves. */
  leaving: boolean;
  expanded: boolean;
  onToggle: () => void;
  actions: TaskActions;
  companyId: string;
  /** Who is reading: their own cursor decides what the message line says. */
  meId: string;
  /** «Ответить» opens the thread over the board instead of navigating away (D-64 §5). */
  onReply?: (task: BoardTask) => void;
  /** The card in front of the «Сообщения» panel: the tail of the thread and a reply line. */
  showReply?: boolean;
  /** The TV board: no expansion, no buttons. */
  readOnly?: boolean;
  /** Public screens without consent: no names (FRONTEND «Анонимизация»). */
  anonymized?: boolean;
};

function contextOf(task: BoardTask, lane: Lane, now: Date, meId: string): string {
  // «срочно» без срока — это тоже ответ на «когда», и громче, чем «без срока» (docs/AI.md §10)
  const due = task.deadline
    ? `до ${humanAqtobe(new Date(task.deadline), now)}`
    : task.priority === "high"
      ? TEXT.urgent
      : TEXT.noDeadline;
  switch (lane) {
    case "overdue":
      return `срок был ${humanAqtobe(new Date(task.deadline as string), now)}`;
    case "declined":
      return task.decline_reason ? task.decline_reason : "без причины";
    case "question":
      return `«${messageOf(task, meId) ?? ""}»`;
    case "review":
      return task.completed_at ? `сдана ${humanAqtobe(new Date(task.completed_at), now)}` : "сдана";
    default:
      if (task.status === "sent") return `ещё не принята · ${due}`;
      if (task.status === "rework") return `на доработке · ${due}`;
      return due;
  }
}

/**
 * One task on the live board: the lane colour on the rail, who and what, the one line
 * of context the lane needs, and the director's quick actions right on the tile. A tap
 * on the text opens the full card in place; the tile never navigates on its own.
 */
export function TaskTile({ task, lane, now, fresh, leaving, expanded, onToggle, actions, companyId, meId, onReply, showReply = false, readOnly = false, anonymized = false }: TaskTileProps) {
  const [rework, setRework] = useState(false);
  const tone: Tone = leaving ? (task.status === "done" ? "gold" : "muted") : LANE_TONE[lane];
  const color = TONE_VAR[tone];
  const who = anonymized ? "Сотрудник" : whoOf(task);
  const word = leaving ? (task.status === "done" ? "принято" : task.status === "revoked" ? "отозвана" : "закрыта") : LANE_WORD[lane];
  const interactive = !readOnly && !leaving;

  const header = (
    <span className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-4 text-muted">
        {fresh && !leaving ? <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> : null}
        <span className="truncate">{who}</span>
      </span>
      <span className="shrink-0 font-display text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color }}>
        {word}
        {interactive ? <span aria-hidden className="ml-1 text-muted">{expanded ? "▴" : "▾"}</span> : null}
      </span>
    </span>
  );

  return (
    <motion.article
      // position only: a size change (expanding, a shorter context line) snaps instead of
      // scaling the text — a scaled tile reads as a glitch, a moved one as a tile moving
      layout="position"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: leaving ? 0.85 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      data-testid="board-tile"
      data-task-id={task.id}
      data-lane={leaving ? "closed" : lane}
      data-status={task.status}
      className="relative overflow-hidden rounded-[20px] border border-border bg-surface"
      style={{ transition: "background-color 200ms, border-color 200ms" }}
    >
      {/* rail and tint in the lane colour — the state reads before the text does */}
      <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: color, transition: "background-color 200ms" }} />
      <span
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full"
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${color} ${leaving ? 28 : 14}%, transparent), transparent 70%)`, transition: "background 200ms" }}
      />

      {expanded && interactive ? (
        <div className="relative p-3 pl-4">
          <button type="button" onClick={onToggle} aria-expanded className="block w-full py-1 text-left">
            {header}
          </button>
          <div className="mt-2">
            <TaskCard task={task} variant="director" actions={actions} companyId={companyId} href={`/tasks/${task.id}`} question={task.question} declineReason={task.decline_reason} />
          </div>
        </div>
      ) : (
        <div className="relative p-4 pl-5">
          {interactive ? (
            <button type="button" onClick={onToggle} aria-expanded={false} className="block w-full text-left transition-transform duration-[120ms] active:scale-[0.99]">
              {header}
              <span className="mt-1.5 line-clamp-2 block text-[17px] font-semibold leading-[22px] text-text">{task.title}</span>
              {/* with the thread tail below, the one-line context would say it twice */}
              {showReply ? null : (
                <span className="mt-1 block truncate text-[14px] leading-[18px]" style={{ color: lane === "work" ? "var(--text-muted)" : color }}>
                  {contextOf(task, lane, now, meId)}
                </span>
              )}
            </button>
          ) : (
            <div>
              {header}
              <span className="mt-1.5 line-clamp-2 block text-[17px] font-semibold leading-[22px] text-text">{task.title}</span>
              <span className="mt-1 block truncate text-[14px] leading-[18px]" style={{ color: lane === "work" || leaving ? "var(--text-muted)" : color }}>
                {contextOf(task, lane, now, meId)}
              </span>
            </div>
          )}

          {/* the director's quick actions: the ones a tile can carry without a sheet */}
          {interactive && lane === "question" && !task.question && task.time_request && task.time_request.senderId !== meId ? (
            // a request for time (D-128): answered right here; another date — the open card
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip
                tone="accent"
                onClick={() => {
                  haptic(12);
                  actions.answerTime({ taskId: task.id, approve: true, proposedIso: task.time_request?.proposed ?? null });
                  toast("Срок согласован");
                }}
              >
                Согласовать · {untilWords(task.time_request.proposed, now)}
              </Chip>
              <Chip
                onClick={() => {
                  actions.answerTime({ taskId: task.id, approve: false, proposedIso: null });
                  toast("Срок прежний");
                }}
              >
                Оставить прежний
              </Chip>
              <Chip tone="muted" onClick={onToggle}>
                Другой срок ›
              </Chip>
            </div>
          ) : null}
          {interactive && lane === "question" && !task.question && !(task.time_request && task.time_request.senderId !== meId) ? (
            // a plain message: seen, or the thread to answer in
            <>
              {showReply ? <ThreadTail taskId={task.id} meId={meId} enabled={showReply} /> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip onClick={() => actions.markRead({ taskId: task.id, companyId, seq: task.last_message?.seq ?? 0 })}>Прочитал</Chip>
                {onReply ? (
                  <button
                    type="button"
                    onClick={() => onReply(task)}
                    className="inline-flex min-h-[34px] items-center rounded-full border border-border bg-surface-2 px-3 font-display text-[13px] font-semibold leading-4 text-text"
                  >
                    Ответить ›
                  </button>
                ) : (
                  <Link href={`/tasks/${task.id}`} prefetch={false} className="inline-flex min-h-[34px] items-center rounded-full border border-border bg-surface-2 px-3 font-display text-[13px] font-semibold leading-4 text-text">
                    Ответить ›
                  </Link>
                )}
              </div>
              {showReply ? (
                <div className="mt-2">
                  <Composer taskId={task.id} companyId={companyId} actions={actions} inline />
                </div>
              ) : null}
            </>
          ) : null}
          {interactive && lane === "question" && task.question ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_ANSWERS.map((text) => (
                <Chip
                  key={text}
                  onClick={() => {
                    actions.sendMessage({ taskId: task.id, companyId, text });
                    actions.markRead({ taskId: task.id, companyId, seq: task.last_message?.seq ?? 0 });
                    toast("Ответил");
                  }}
                >
                  {text}
                </Chip>
              ))}
            </div>
          ) : null}
          {interactive && lane === "review" ? (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  haptic(15);
                  actions.transition({ taskId: task.id, toStatus: "done" });
                }}
              >
                {BUTTON.approve}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRework(true)}>
                {BUTTON.rework}
              </Button>
            </div>
          ) : null}
          {interactive && lane === "declined" ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => actions.transition({ taskId: task.id, toStatus: "sent" })}>
                {BUTTON.insist}
              </Button>
              <Button size="sm" variant="secondary" onClick={onToggle}>
                {BUTTON.reassign}
              </Button>
            </div>
          ) : null}
          {interactive && lane === "overdue" ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={onToggle}>
                {BUTTON.extend}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {interactive ? (
        <ReworkSheet open={rework} onClose={() => setRework(false)} onSubmit={(comment) => actions.transition({ taskId: task.id, toStatus: "rework", comment })} />
      ) : null}
    </motion.article>
  );
}
