"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { DeadlinePill, isUrgentNow, PersonChip, StatusEyebrow, TaskRail } from "@/components/tasks/TaskChrome";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { toast } from "@/components/ui/Toast";
import type { BoardTask } from "@/lib/pulse/board";
import { QUICK_ANSWERS, type DeskAction } from "@/lib/tasks/desk";
import { isWorking, passedWord, untilWords } from "@/lib/tasks/lifecycle";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { BUTTON, deadlineLabel, STATUS_LABEL, TEXT } from "@/lib/tasks/status-text";
import { toneOf, TONE_VAR, type Tone } from "@/lib/tasks/tone";
import { AudioOriginal } from "./AudioOriginal";
import { DeliveryStatus } from "./DeliveryStatus";
import { Icon, type IconName } from "./desk/icons";
import { ACTION_ICON, ACTION_LABEL, allActionsFor, isPrimaryKey, LifecycleNotes, wideLabelOf } from "./list/DirectorTaskCard";
import { useDirectorControls } from "./list/useDirectorControls";
import { useEmployeeControls } from "./list/useEmployeeControls";

export type TaskCardVariant = "employee" | "director";

/** A board row carries what the task row does not — a request for time, a suggestion (D-129). */
type CardTask = TaskWithPeople & Partial<Pick<BoardTask, "time_request" | "suggestion" | "nudged_at" | "partial">>;

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
};

/* -------------------------------------------------------------------------- */

/**
 * The full card of a task where a list is not the point — Пульс, Лента, a person's card.
 * Its buttons are the hooks of «Задачи» (D-83, D-129), so a button means the same thing on
 * every screen: the employee's «Не могу» asks for time or names a colleague here too, the
 * director answers a request for time and hands a task to the suggested person in one tap.
 */
export function TaskCard({ task, variant, actions, companyId, declineReason, question, href }: TaskCardProps) {
  const router = useRouter();

  // the clock is read once per mount: the pill needs no live tick on a card
  const [now] = useState(() => new Date());
  const deadline = deadlineLabel(task, now);
  const tone = toneOf(task.status, deadline.overdue);
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

  const urgent = (
    <span className="inline-flex items-center gap-1 rounded-full bg-warn/12 px-2 py-0.5 text-[12px] font-semibold leading-4 text-warn">
      <Icon name="flame" size={13} />
      {TEXT.urgent}
    </span>
  );

  const title = <h2 className="text-[19px] font-semibold leading-6 text-text">{task.title}</h2>;
  const threeKeys = variant === "employee" && task.status === "sent";
  // in work «Выполнено» leads on its own row, «Уточнить» and «Не могу» under it
  const workKeys = variant === "employee" && isWorking(task.status) && task.status !== "sent";

  return (
    <article
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

      {variant === "employee" && request ? (
        <Banner tone="warn" icon={<Icon name="clock" size={15} />}>
          Просите срок {untilWords(request.proposed, now)} · ждёт ответа директора
        </Banner>
      ) : null}
      {variant === "director" ? (
        <div className="relative">
          <LifecycleNotes task={task} request={request} suggestion={suggestion} partial={Boolean(task.partial)} nudgedAt={task.nudged_at ?? null} now={now} />
        </div>
      ) : null}

      {variant === "director" && question ? (
        <QuestionBanner
          question={question}
          onAnswer={(text) => {
            actions.sendMessage({ taskId: task.id, companyId, text });
            toast("Ответил");
          }}
        />
      ) : null}

      <div className={`relative mt-4 gap-2 ${threeKeys ? "grid grid-cols-3" : workKeys ? "grid grid-cols-2" : "flex flex-wrap"}`}>
        {variant === "employee" ? (
          <EmployeeButtons task={task} onPress={(action) => employee.press(action, task)} />
        ) : (
          <DirectorButtons
            actions={allActionsFor(task, { request: Boolean(request), suggestion: Boolean(suggestion) })}
            label={(key) => wideLabelOf(key, request, suggestion, now) ?? (key === "reassign" ? BUTTON.reassign : ACTION_LABEL[key])}
            onPress={(key) => director.press(key, task)}
          />
        )}
      </div>

      {variant === "employee" ? employee.sheets : director.sheets}
    </article>
  );
}

/* -------------------------------------------------------------------------- */

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
    return task.passed_to ? (
      <Banner tone="muted" icon={<Icon name="swap" size={15} />}>
        {passedWord(task.passed?.full_name)}
      </Banner>
    ) : (
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
function EmployeeButtons({ task, onPress }: { task: TaskWithPeople; onPress: (action: "accept" | "ask" | "decline" | "complete") => void }) {
  if (task.status === "sent") {
    return (
      <>
        <Button block className="!px-2 whitespace-nowrap" icon={<Icon name="check" />} onClick={() => onPress("accept")}>
          {BUTTON.accept}
        </Button>
        <Button block className="!px-2 whitespace-nowrap" variant="secondary" icon={<Icon name="question" />} onClick={() => onPress("ask")}>
          {BUTTON.ask}
        </Button>
        <Button block className="!px-2 whitespace-nowrap" variant="danger" icon={<Icon name="x" />} onClick={() => onPress("decline")}>
          {BUTTON.cant}
        </Button>
      </>
    );
  }

  // rework needs no second «Принял» — the tap sends accepted, then pending_review.
  if (isWorking(task.status)) {
    return (
      <>
        <Button block className="col-span-2 whitespace-nowrap" icon={<Icon name="check" />} onClick={() => onPress("complete")}>
          {BUTTON.complete}
        </Button>
        <Button block className="!px-2 whitespace-nowrap" variant="secondary" icon={<Icon name="question" />} onClick={() => onPress("ask")}>
          {BUTTON.ask}
        </Button>
        <Button block className="!px-2 whitespace-nowrap" variant="secondary" icon={<Icon name="clock" />} onClick={() => onPress("decline")}>
          {BUTTON.cant}
        </Button>
      </>
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
