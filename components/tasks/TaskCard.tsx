"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { initialsOf } from "@/lib/people/queries";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { BUTTON, deadlineLabel, STATUS_LABEL, TEXT, type TaskStatus } from "@/lib/tasks/status-text";
import { AudioOriginal } from "./AudioOriginal";
import { DeliveryStatus } from "./DeliveryStatus";
import { AskSheet, DeclineSheet, ReportSheet, ReworkSheet } from "./TaskSheets";

export type TaskCardVariant = "employee" | "director";

export type TaskCardProps = {
  task: TaskWithPeople;
  variant: TaskCardVariant;
  actions: TaskActions;
  companyId: string;
  /** Reason of a decline — it lives in the thread, so only the thread has it. */
  declineReason?: string | null;
  /** Omitted inside the thread itself: the card must not link to its own page. */
  href?: string;
};

type OpenSheet = "none" | "ask" | "decline" | "report" | "rework" | "revoke";

/* -------------------------------------------------------------------------- */
/* Tone: one colour per status, used by the rail, the tint and the pill        */
/* -------------------------------------------------------------------------- */

type Tone = "accent" | "ok" | "warn" | "danger" | "muted" | "gold";

const TONE_VAR: Record<Tone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  muted: "var(--text-muted)",
  gold: "var(--gold)",
};

function toneOf(status: TaskStatus, overdue: boolean): Tone {
  if (overdue) return "danger";
  switch (status) {
    case "sent":
      return "accent";
    case "accepted":
    case "in_progress":
      return "ok";
    case "pending_review":
    case "rework":
      return "warn";
    case "done":
      return "gold";
    case "declined":
      return "danger";
    default:
      return "muted";
  }
}

/* -------------------------------------------------------------------------- */
/* Icons: stroke family, 16px, inherit colour                                  */
/* -------------------------------------------------------------------------- */

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Icon({ name, size = 16 }: { name: "clock" | "check" | "question" | "x" | "rotate" | "undo" | "flame" | "quote" | "hand"; size?: number }) {
  const paths: Record<typeof name, ReactNode> = {
    clock: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    question: (
      <>
        <path d="M9 9.5a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4" />
        <circle cx="12" cy="18" r="0.6" fill="currentColor" />
      </>
    ),
    x: <path d="M6 6l12 12M18 6L6 18" />,
    rotate: <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5" />,
    undo: <path d="M9 14 4 9l5-5M4 9h9a6 6 0 0 1 0 12h-3" />,
    flame: <path d="M12 3s5 4.5 5 9.5a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 1.5.8 2.5 2 3 0-3 1-5.5 1-8z" />,
    quote: <path d="M8 6h8M6 12h12M8 18h8" />,
    hand: <path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11m0-6a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5.2-3L4.5 13a1.6 1.6 0 0 1 2.6-1.8L9 13" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...STROKE} aria-hidden className="shrink-0">
      {paths[name]}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */

export function TaskCard({ task, variant, actions, companyId, declineReason, href }: TaskCardProps) {
  const [sheet, setSheet] = useState<OpenSheet>("none");
  const close = () => setSheet("none");

  // the clock is read once per mount: «скоро» needs no live tick on a card
  const [now] = useState(() => Date.now());
  const deadline = deadlineLabel(task);
  const soon =
    !deadline.none && !deadline.overdue && task.deadline
      ? new Date(task.deadline).getTime() - now < 24 * 3_600_000
      : false;
  const tone = toneOf(task.status, deadline.overdue);
  const dimmed = task.status === "revoked" || task.status === "done";
  const deadlineTone: Tone = deadline.overdue ? "danger" : soon ? "warn" : deadline.none ? "muted" : "accent";

  const title = (
    <h2 className="text-[19px] font-semibold leading-6 text-text">{task.title}</h2>
  );

  return (
    <article
      className={["card relative overflow-hidden p-4 pl-5 transition-transform duration-[120ms] active:scale-[0.995]", dimmed ? "opacity-70" : ""].join(" ")}
      data-tone={tone}
    >
      {/* status rail and a faint tint in the same colour — the state reads before the text does */}
      <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: TONE_VAR[tone] }} />
      <span
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full"
        style={{ background: `radial-gradient(circle, color-mix(in srgb, ${TONE_VAR[tone]} 16%, transparent), transparent 70%)` }}
      />

      {/* row 1: status and due */}
      <div className="relative flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: TONE_VAR[tone] }}>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: TONE_VAR[tone] }} />
          {deadline.overdue && task.status !== "done" ? "Просрочено" : STATUS_LABEL[task.status]}
        </span>
        <span
          className="nums inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-semibold leading-4"
          style={{
            color: TONE_VAR[deadlineTone],
            borderColor: `color-mix(in srgb, ${TONE_VAR[deadlineTone]} 40%, transparent)`,
            background: `color-mix(in srgb, ${TONE_VAR[deadlineTone]} 10%, transparent)`,
          }}
        >
          <Icon name="clock" size={14} />
          {deadline.text}
        </span>
      </div>

      {/* row 2: title and body */}
      <div className="relative mt-2">
        {href ? (
          <Link href={href} className="block">
            {title}
          </Link>
        ) : (
          title
        )}
        {task.body ? <p className="mt-1.5 text-[15px] leading-[21px] text-muted">{task.body}</p> : null}
      </div>

      {/* row 3: who and how urgent */}
      {(variant === "director" && task.assignee) || task.priority === "high" ? (
        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          {variant === "director" && task.assignee ? (
            <span className="inline-flex items-center gap-2 text-[13px] leading-4 text-muted">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-bg"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
              >
                {initialsOf(task.assignee.full_name)}
              </span>
              {task.assignee.full_name}
            </span>
          ) : null}
          {task.priority === "high" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warn/12 px-2 py-0.5 text-[12px] font-semibold leading-4 text-warn">
              <Icon name="flame" size={13} />
              {TEXT.urgent}
            </span>
          ) : null}
        </div>
      ) : null}

      {variant === "director" && task.status !== "scheduled" && task.status !== "revoked" ? (
        <div className="relative">
          <DeliveryStatus taskId={task.id} status={task.status} />
        </div>
      ) : null}

      {task.source_audio_path ? (
        <div className="relative">
          <AudioOriginal path={task.source_audio_path} />
        </div>
      ) : null}

      {task.source_transcript ? (
        <details className="group relative mt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] leading-4 text-muted [&::-webkit-details-marker]:hidden">
            <Icon name="quote" size={14} />
            {TEXT.transcriptSpoiler}
            <span aria-hidden className="ml-auto transition-transform duration-[120ms] group-open:rotate-180">▾</span>
          </summary>
          <blockquote className="mt-2 border-l-2 pl-3 text-[14px] italic leading-[19px] text-muted" style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)" }}>
            «{task.source_transcript}»
          </blockquote>
        </details>
      ) : null}

      <StatusBanner task={task} declineReason={declineReason} />

      <div className="relative mt-4 flex flex-wrap gap-2">
        {variant === "employee" ? (
          <EmployeeActions task={task} onOpen={setSheet} actions={actions} />
        ) : (
          <DirectorActions task={task} onOpen={setSheet} actions={actions} />
        )}
      </div>

      <AskSheet
        open={sheet === "ask"}
        onClose={close}
        onSubmit={(text) => {
          actions.sendMessage({ taskId: task.id, companyId, text, meta: { is_question: true } });
          toast(TEXT.askedToast);
        }}
      />

      <DeclineSheet open={sheet === "decline"} onClose={close} onSubmit={(reason) => actions.transition({ taskId: task.id, toStatus: "declined", reason })} />

      <ReportSheet
        open={sheet === "report"}
        onClose={close}
        onSubmit={(text, filePath) => {
          if (text || filePath) actions.sendMessage({ taskId: task.id, companyId, text, filePath });
          actions.complete({ taskId: task.id, fromStatus: task.status });
        }}
      />

      <ReworkSheet open={sheet === "rework"} onClose={close} onSubmit={(comment) => actions.transition({ taskId: task.id, toStatus: "rework", comment })} />

      <Sheet open={sheet === "revoke"} onClose={close} title={BUTTON.revoke}>
        <p className="text-[16px] leading-[22px] text-muted">{TEXT.revokeConfirm}</p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            block
            onClick={() => {
              actions.revoke(task.id);
              close();
            }}
          >
            {BUTTON.revoke}
          </Button>
          <Button variant="secondary" block onClick={close}>
            Не сейчас
          </Button>
        </div>
      </Sheet>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function Banner({ tone, icon, children }: { tone: Tone; icon: ReactNode; children: ReactNode }) {
  return (
    <p
      className="relative mt-3 flex items-start gap-2 rounded-[12px] border px-3 py-2 text-[14px] leading-[18px]"
      style={{
        color: TONE_VAR[tone],
        borderColor: `color-mix(in srgb, ${TONE_VAR[tone]} 35%, transparent)`,
        background: `color-mix(in srgb, ${TONE_VAR[tone]} 9%, transparent)`,
      }}
    >
      <span className="mt-px">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

function StatusBanner({ task, declineReason }: { task: TaskWithPeople; declineReason?: string | null }) {
  if (task.status === "rework") {
    return (
      <Banner tone="warn" icon={<Icon name="rotate" size={15} />}>
        {TEXT.reworkBanner}
      </Banner>
    );
  }
  if (task.status === "pending_review") {
    return (
      <Banner tone="warn" icon={<Icon name="clock" size={15} />}>
        {TEXT.underReview}
      </Banner>
    );
  }
  if (task.status === "declined") {
    return (
      <Banner tone="danger" icon={<Icon name="hand" size={15} />}>
        Отказ{declineReason ? `: ${declineReason}` : ""}
      </Banner>
    );
  }
  if (task.status === "revoked") {
    return (
      <Banner tone="muted" icon={<Icon name="undo" size={15} />}>
        {TEXT.revoked}
      </Banner>
    );
  }
  if (task.status === "done") {
    return (
      <Banner tone="gold" icon={<Icon name="check" size={15} />}>
        {STATUS_LABEL.done}
      </Banner>
    );
  }
  return null;
}

/**
 * Exactly the table of docs/FRONTEND.md «Состояние задачи → набор кнопок».
 * Three buttons at most — принцип 2, not to be widened.
 */
function EmployeeActions({ task, onOpen, actions }: { task: TaskWithPeople; onOpen: (sheet: OpenSheet) => void; actions: TaskActions }) {
  if (task.status === "sent") {
    return (
      <>
        <Button icon={<Icon name="check" />} onClick={() => actions.transition({ taskId: task.id, toStatus: "accepted" })}>
          {BUTTON.accept}
        </Button>
        <Button variant="secondary" icon={<Icon name="question" />} onClick={() => onOpen("ask")}>
          {BUTTON.ask}
        </Button>
        <Button variant="danger" icon={<Icon name="x" />} onClick={() => onOpen("decline")}>
          {BUTTON.cant}
        </Button>
      </>
    );
  }

  // rework needs no second «Принял» — the tap sends accepted, then pending_review.
  if (task.status === "accepted" || task.status === "rework") {
    return (
      <Button icon={<Icon name="check" />} onClick={() => onOpen("report")}>
        {BUTTON.complete}
      </Button>
    );
  }

  return null;
}

function DirectorActions({ task, onOpen, actions }: { task: TaskWithPeople; onOpen: (sheet: OpenSheet) => void; actions: TaskActions }) {
  const terminal = task.status === "done" || task.status === "revoked" || task.status === "declined";

  return (
    <>
      {task.status === "pending_review" ? (
        <>
          <Button icon={<Icon name="check" />} onClick={() => actions.transition({ taskId: task.id, toStatus: "done" })}>
            {BUTTON.approve}
          </Button>
          <Button variant="secondary" icon={<Icon name="rotate" />} onClick={() => onOpen("rework")}>
            {BUTTON.rework}
          </Button>
        </>
      ) : null}

      {task.status === "declined" ? (
        <>
          <Button onClick={() => actions.transition({ taskId: task.id, toStatus: "sent" })}>{BUTTON.insist}</Button>
          <Button variant="secondary" onClick={() => onOpen("revoke")}>
            {BUTTON.cancel}
          </Button>
        </>
      ) : null}

      {!terminal ? (
        <Button variant="ghost" icon={<Icon name="undo" />} onClick={() => onOpen("revoke")}>
          {BUTTON.revoke}
        </Button>
      ) : null}
    </>
  );
}
