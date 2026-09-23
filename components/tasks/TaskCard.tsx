"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { DeadlinePill, isUrgentNow, PersonChip, StatusEyebrow, TaskHead, TaskRail } from "@/components/tasks/TaskChrome";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { BUTTON, deadlineLabel, STATUS_LABEL, TEXT } from "@/lib/tasks/status-text";
import { toneOf, TONE_VAR, type Tone } from "@/lib/tasks/tone";
import { AssigneePicker } from "@/components/confirm/AssigneePicker";
import { DeadlineSheet } from "@/components/confirm/DeadlineSheet";
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
  /** The employee's open question — the director answers it right on the card. */
  question?: string | null;
  /** Omitted inside the thread itself: the card must not link to its own page. */
  href?: string;
  /**
   * On a list drawn as a trace (components/tasks/Trace.tsx) the thread and its bead
   * already carry the state, so the card drops its own box, rail and padding and hangs
   * off the line as text plus buttons. Everywhere else it stays a card.
   */
  bare?: boolean;
  /** Off under a «Просрочено» heading — the word would only repeat it. */
  showStatus?: boolean;
};

type OpenSheet = "none" | "ask" | "decline" | "report" | "rework" | "revoke" | "extend" | "reassign" | "delete";

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

export function TaskCard({ task, variant, actions, companyId, declineReason, question, href, bare = false, showStatus = true }: TaskCardProps) {
  const [sheet, setSheet] = useState<OpenSheet>("none");
  const close = () => setSheet("none");
  const router = useRouter();

  // the clock is read once per mount: the pill needs no live tick on a card
  const [now] = useState(() => new Date());
  const deadline = deadlineLabel(task, now);
  const tone = toneOf(task.status, deadline.overdue);
  const dimmed = task.status === "revoked" || task.status === "done";

  const urgent = (
    <span className="inline-flex items-center gap-1 rounded-full bg-warn/12 px-2 py-0.5 text-[12px] font-semibold leading-4 text-warn">
      <Icon name="flame" size={13} />
      {TEXT.urgent}
    </span>
  );

  const title = (
    <h2
      className={
        bare
          ? "font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em] text-text"
          : "text-[19px] font-semibold leading-6 text-text"
      }
    >
      {task.title}
    </h2>
  );

  return (
    <article
      className={[
        bare
          ? "relative"
          : "card relative overflow-hidden p-4 pl-5 transition-transform duration-[120ms] active:scale-[0.995]",
        dimmed ? "opacity-70" : "",
      ].join(" ")}
      data-tone={tone}
    >
      {/* the state reads before the text does: rail and tint, then the two facts of row 1 */}
      {bare ? null : <TaskRail tone={tone} />}

      {bare ? (
        /* on a trace the head is shared with the capsule of «Задачи», to the pixel */
        <TaskHead
          task={task}
          now={now}
          href={href}
          person={variant === "director" ? task.assignee?.full_name : undefined}
          showStatus={showStatus}
          extra={task.priority === "high" && !isUrgentNow(task) ? urgent : null}
        />
      ) : (
        <>
          {/* row 1: status and due */}
          <div className="relative flex items-center justify-between gap-2">
            <StatusEyebrow status={task.status} overdue={deadline.overdue} tone={tone} />
            <DeadlinePill task={task} now={now} />
          </div>

          {/* row 2: title */}
          <div className="relative mt-2">
            {href ? (
              <Link href={href} className="block">
                {title}
              </Link>
            ) : (
              title
            )}
          </div>

          {/* row 3: who and how urgent */}
          {(variant === "director" && task.assignee) || (task.priority === "high" && !isUrgentNow(task)) ? (
            <div className="relative mt-3 flex flex-wrap items-center gap-2">
              {variant === "director" && task.assignee ? <PersonChip fullName={task.assignee.full_name} /> : null}
              {task.priority === "high" && !isUrgentNow(task) ? urgent : null}
            </div>
          ) : null}
        </>
      )}

      {task.body ? <p className="relative mt-1.5 text-[15px] leading-[21px] text-muted">{task.body}</p> : null}

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

      {variant === "director" && question ? (
        <QuestionBanner
          question={question}
          onAnswer={(text) => {
            actions.sendMessage({ taskId: task.id, companyId, text });
            toast("Ответил");
          }}
        />
      ) : null}

      <div className={`relative gap-2 ${bare ? "mt-3" : "mt-4"} ${variant === "employee" && task.status === "sent" ? "grid grid-cols-3" : "flex flex-wrap"}`}>
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
          // one call: the words, the photo and the handover are one transaction (D-64 §3)
          actions.complete({
            taskId: task.id,
            fromStatus: task.status,
            report: text || filePath ? { text: text || undefined, file_path: filePath ?? undefined } : undefined,
          });
        }}
      />

      <ReworkSheet open={sheet === "rework"} onClose={close} onSubmit={(comment) => actions.transition({ taskId: task.id, toStatus: "rework", comment })} />

      {variant === "director" ? (
        <>
          <DeadlineSheet
            open={sheet === "extend"}
            onClose={close}
            currentIso={task.deadline}
            onPick={(iso) => actions.extend({ taskId: task.id, deadlineIso: iso })}
          />
          <AssigneePicker
            open={sheet === "reassign"}
            onClose={close}
            title="Кому передать?"
            hint="Задача уйдёт этому человеку как новая, у прежнего исполнителя закроется с пометкой"
            candidates={[]}
            onPick={(user) => {
              actions.reassign({ taskId: task.id, assigneeId: user.user_id, assigneeName: user.full_name });
              close();
            }}
          />
        </>
      ) : null}

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

      {variant === "director" ? (
        <Sheet open={sheet === "delete"} onClose={close} title={BUTTON.remove}>
          <p className="text-[16px] leading-[22px] text-muted">{TEXT.removeConfirm}</p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="danger"
              block
              onClick={() => {
                actions.remove(task.id);
                close();
                // on the task's own page there is nothing left to look at
                if (!href) router.back();
              }}
            >
              {BUTTON.remove}
            </Button>
            <Button variant="secondary" block onClick={close}>
              Не сейчас
            </Button>
          </div>
        </Sheet>
      ) : null}
    </article>
  );
}

/* -------------------------------------------------------------------------- */

/** Quick answers of the swipe table (FRONTEND «Вопросы»), as chips; anything longer — in the thread. */
const QUICK_ANSWERS = ["Да", "Нет", "Позже", "Действуй сам"] as const;

function QuestionBanner({ question, onAnswer }: { question: string; onAnswer: (text: string) => void }) {
  return (
    <div className="mt-3">
      <Banner tone="warn" icon={<Icon name="question" size={15} />}>
        {question}
      </Banner>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_ANSWERS.map((text) => (
          <Chip key={text} onClick={() => onAnswer(text)}>
            {text}
          </Chip>
        ))}
      </div>
    </div>
  );
}

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
        <Button
          block
          className="!px-2 whitespace-nowrap"
          icon={<Icon name="check" />}
          onClick={() => {
            haptic(15);
            actions.transition({ taskId: task.id, toStatus: "accepted" });
          }}
        >
          {BUTTON.accept}
        </Button>
        <Button block className="!px-2 whitespace-nowrap" variant="secondary" icon={<Icon name="question" />} onClick={() => onOpen("ask")}>
          {BUTTON.ask}
        </Button>
        <Button block className="!px-2 whitespace-nowrap" variant="danger" icon={<Icon name="x" />} onClick={() => onOpen("decline")}>
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
          <Button
            icon={<Icon name="check" />}
            onClick={() => {
              haptic(15);
              actions.transition({ taskId: task.id, toStatus: "done" });
            }}
          >
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
          <Button variant="secondary" onClick={() => onOpen("reassign")}>
            {BUTTON.reassign}
          </Button>
          <Button variant="ghost" onClick={() => onOpen("revoke")}>
            {BUTTON.cancel}
          </Button>
        </>
      ) : null}

      {!terminal ? (
        <>
          {task.status !== "pending_review" ? (
            <Button variant="secondary" onClick={() => onOpen("extend")}>
              {BUTTON.extend}
            </Button>
          ) : null}
          {["sent", "accepted", "in_progress", "rework"].includes(task.status) ? (
            <Button variant="ghost" onClick={() => onOpen("reassign")}>
              {BUTTON.reassign}
            </Button>
          ) : null}
          <Button variant="ghost" icon={<Icon name="undo" />} onClick={() => onOpen("revoke")}>
            {BUTTON.revoke}
          </Button>
        </>
      ) : null}

      {/* cleanup, not a status: a wrong or test order disappears without a trace */}
      <Button variant="ghost" className="!text-danger/80" icon={<Icon name="x" />} onClick={() => onOpen("delete")}>
        {BUTTON.remove}
      </Button>
    </>
  );
}
