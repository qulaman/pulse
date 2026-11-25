"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { DeadlinePill, isUrgentNow, PersonChip, StatusEyebrow, TaskRail } from "@/components/tasks/TaskChrome";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import type { BoardTask } from "@/lib/pulse/board";
import type { DeskAction } from "@/lib/tasks/reasons";
import { isWorking } from "@/lib/tasks/lifecycle";
import type { QuickAnswer } from "@/lib/tasks/answers";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { BUTTON, deadlineLabel, reworkBannerText, STATUS_LABEL, TEXT } from "@/lib/tasks/status-text";
import { isStaleUnaccepted } from "@/lib/tasks/attention";
import { statusWord } from "@/lib/tasks/overview";
import { toneOf } from "@/lib/tasks/tone";
import { AudioOriginal } from "./AudioOriginal";
import { DeliveryStatus } from "./DeliveryStatus";
import { Icon, type IconName } from "./icons";
import { QuickAnswers, sendQuickAnswer } from "./director/QuickAnswers";
import { ACTION_ICON, ACTION_LABEL, allActionsFor, isPrimaryKey, LifecycleNotes, wideLabelOf } from "./list/DirectorTaskCard";
import { EmployeeKeys } from "./list/EmployeeKeys";
import { useDirectorControls } from "./list/useDirectorControls";
import { useEmployeeControls } from "./list/useEmployeeControls";
import { Note, RevokedNote, TimeRequestNote, TranscriptSpoiler } from "./TaskNotes";

export type TaskCardVariant = "employee" | "director";

/** A board row carries what the task row does not — a request for time, a suggestion (D-128). */
type CardTask = TaskWithPeople & Partial<Pick<BoardTask, "time_request" | "suggestion" | "nudged_at" | "partial" | "rework_comment">>;

export type TaskCardProps = {
  task: CardTask;
  variant: TaskCardVariant;
  actions: TaskActions;
  companyId: string;
  /** Reason of a decline — it lives in the thread, so only the thread has it. */
  declineReason?: string | null;
  /** The employee's open question — the director answers it right on the card. */
  question?: string | null;
  /** Omitted inside the thread itself: the card must not link to its own page. */
  href?: string;
  /** The director's card: the assignee's pushes do not reach them, so an untaken task is amber at once (D-195). */
  unreachable?: boolean;
};

/* -------------------------------------------------------------------------- */

/**
 * The full card of a task where a list is not the point — Пульс (the director's and the employee's), a person's card.
 * Its buttons are the hooks of «Задачи» (D-83, D-128), so a button means the same thing on
 * every screen: the employee's «Не могу» asks for time or names a colleague here too, the
 * director answers a request for time and hands a task to the suggested person in one tap.
 */
export function TaskCard({ task, variant, actions, companyId, declineReason, question, href, unreachable = false }: TaskCardProps) {
  const router = useRouter();

  // the clock is read once per mount: the pill needs no live tick on a card
  const [now] = useState(() => new Date());
  const deadline = deadlineLabel(task, now);
  // a new task is the holder's move (amber) and, to the director, amber once nobody has taken it for half an hour —
  // or at once when the assignee's pushes do not reach them
  const tone = toneOf(task.status, deadline.overdue, {
    attention: variant === "employee" || isStaleUnaccepted(task, now) || (unreachable && task.status === "sent"),
  });
  const dimmed = task.status === "revoked" || task.status === "done";
  const request = task.time_request && isWorking(task.status) ? task.time_request : null;
  const suggestion = task.status === "declined" ? (task.suggestion ?? null) : null;

  const director = useDirectorControls({
    base: actions,
    companyId,
    tasks: [task],
    questionOf: () => question ?? null,
    requestOf: () => request,
    suggestionOf: () => suggestion,
    now,
    // on the task's own page there is nothing left to look at
    afterRemove: href ? undefined : () => router.back(),
  });
  const employee = useEmployeeControls({ actions, companyId, tasks: [task] });
  // the card itself: on Лента a press answers by sending a copy of it flying (D-167)
  const card = useRef<HTMLElement>(null);

  const urgent = (
    <span className="inline-flex items-center gap-1 rounded-full bg-warn/12 px-2 py-0.5 text-[12px] font-semibold leading-4 text-warn">
      <Icon name="flame" size={13} />
      {TEXT.urgent}
    </span>
  );

  const title = <h2 className="text-[19px] font-semibold leading-6 text-text">{task.title}</h2>;

  return (
    <article
      ref={card}
      className={[
        "card relative overflow-hidden p-4 pl-5 transition-transform duration-[120ms] active:scale-[0.995]",
        dimmed ? "opacity-70" : "",
      ].join(" ")}
      data-tone={tone}
    >
      {/* the state reads before the text does: rail and tint, then the two facts of row 1 */}
      <TaskRail tone={tone} />

      {/* row 1: status and due */}
      <div className="relative flex items-center justify-between gap-2">
        <StatusEyebrow status={task.status} overdue={deadline.overdue} tone={tone} word={statusWord(task, variant, now)} />
        <DeadlinePill task={task} now={now} />
      </div>

      {/* row 2: title; per-card links do not prefetch — forty cards were forty background
          renders of the task's layout, each with its own session check (D-126) */}
      <div className="relative mt-2">
        {href ? (
          <Link href={href} prefetch={false} className="block">
            {title}
          </Link>
        ) : (
          title
        )}
      </div>

      {/* row 3: who and how urgent — the other side of the order: the holder to the director, who
          gave it to the employee (the list and the task's screen say the same, D-194) */}
      {(variant === "director" ? task.assignee : task.author) || (task.priority === "high" && !isUrgentNow(task)) ? (
        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          {variant === "director" && task.assignee ? <PersonChip fullName={task.assignee.full_name} /> : null}
          {variant === "employee" && task.author ? <PersonChip fullName={task.author.full_name} /> : null}
          {task.priority === "high" && !isUrgentNow(task) ? urgent : null}
        </div>
      ) : null}

      {task.body ? <p className="relative mt-1.5 text-[15px] leading-[21px] text-muted">{task.body}</p> : null}

      {variant === "director" && task.status !== "scheduled" && task.status !== "revoked" ? (
        <div className="relative">
          <DeliveryStatus taskId={task.id} status={task.status} assigneeId={task.assignee_id} onSendNow={() => actions.sendNow(task.id)} />
        </div>
      ) : null}

      {task.source_audio_path ? (
        <div className="relative">
          <AudioOriginal path={task.source_audio_path} />
        </div>
      ) : null}

      <TranscriptSpoiler task={task} className="relative" />

      <StatusNote task={task} declineReason={declineReason} />

      {variant === "employee" && request ? <TimeRequestNote proposed={request.proposed} now={now} className="relative" /> : null}
      {variant === "director" ? (
        <div className="relative">
          <LifecycleNotes task={task} request={request} suggestion={suggestion} partial={Boolean(task.partial)} nudgedAt={task.nudged_at ?? null} now={now} />
        </div>
      ) : null}

      {variant === "director" && question ? (
        <QuestionBanner
          question={question}
          deadline={task.deadline}
          now={now}
          onAnswer={(answer) => {
            sendQuickAnswer(actions, task.id, companyId, answer);
            toast("Ответил");
          }}
          onWords={() => director.answer(task, null)}
        />
      ) : null}

      {variant === "employee" ? (
        <EmployeeKeys status={task.status} className="relative" onPress={(action) => employee.press(action, task, card.current)} />
      ) : (
        <div className="relative mt-4 flex flex-wrap gap-2">
          <DirectorButtons
            actions={allActionsFor(task, { request: Boolean(request), suggestion: Boolean(suggestion) })}
            label={(key) => wideLabelOf(key, request, suggestion, now) ?? (key === "reassign" ? BUTTON.reassign : ACTION_LABEL[key])}
            onPress={(key) => director.press(key, task)}
          />
        </div>
      )}

      {variant === "employee" ? employee.sheets : director.sheets}
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function QuestionBanner({
  question,
  deadline,
  now,
  onAnswer,
  onWords,
}: {
  question: string;
  deadline: string | null;
  now: Date;
  onAnswer: (answer: QuickAnswer) => void;
  onWords: () => void;
}) {
  return (
    <div className="mt-3">
      <Note tone="warn" icon={<Icon name="question" size={15} />} className="relative">
        {question}
      </Note>
      <QuickAnswers question={question} deadline={deadline} now={now} onAnswer={onAnswer} onWords={onWords} />
    </div>
  );
}

/** The state said in words where the head does not say enough: a return, a refusal, a recall, «принята». */
function StatusNote({ task, declineReason }: { task: CardTask; declineReason?: string | null }) {
  if (task.status === "rework") {
    // the director's own words with the return, when the board has them — not a pointer to
    // «комментарий внутри» behind a link nobody sees as one (D-173)
    return (
      <Note tone="warn" icon={<Icon name="rotate" size={15} />} className="relative">
        <span className="line-clamp-3">{task.rework_comment ? reworkBannerText(task.rework_comment) : TEXT.reworkBanner}</span>
      </Note>
    );
  }
  if (task.status === "declined") {
    return (
      <Note tone="danger" icon={<Icon name="hand" size={15} />} className="relative">
        Отказ{declineReason ? `: ${declineReason}` : ""}
      </Note>
    );
  }
  if (task.status === "revoked") return <RevokedNote task={task} className="relative" />;
  if (task.status === "done") {
    return (
      <Note tone="gold" icon={<Icon name="check" size={15} />} className="relative">
        {STATUS_LABEL.done}
      </Note>
    );
  }
  return null;
}

/** Every move the task allows, in the order of «Все действия»; the first is loud when it closes the director's turn. */
function DirectorButtons({ actions, label, onPress }: { actions: DeskAction[]; label: (key: DeskAction) => string; onPress: (key: DeskAction) => void }) {
  return (
    <>
      {actions.map((key, index) => {
        const quiet = key === "remove" || key === "cancel" || key === "revoke" || key === "keep";
        const icon = ACTION_ICON[key];
        return (
          <Button
            key={key}
            data-testid={`task-action-${key}`}
            variant={index === 0 && isPrimaryKey(key, null) ? "primary" : quiet ? "ghost" : "secondary"}
            className={key === "remove" ? "!text-danger/80" : ""}
            icon={icon ? <Icon name={icon as IconName} /> : undefined}
            onClick={() => onPress(key)}
          >
            {key === "remove" ? BUTTON.remove : label(key)}
          </Button>
        );
      })}
    </>
  );
}
