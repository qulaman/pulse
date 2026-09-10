"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { BUTTON, deadlineLabel, STATUS_LABEL, TEXT } from "@/lib/tasks/status-text";
import { AudioOriginal } from "./AudioOriginal";
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

export function TaskCard({
  task,
  variant,
  actions,
  companyId,
  declineReason,
  href,
}: TaskCardProps) {
  const [sheet, setSheet] = useState<OpenSheet>("none");
  const close = () => setSheet("none");

  const deadline = deadlineLabel(task);
  const dimmed = task.status === "revoked" || task.status === "done";

  const title = (
    <h2 className="text-[19px] font-semibold leading-6 text-text">{task.title}</h2>
  );

  return (
    <article
      className={[
        "rounded-[16px] border border-border bg-surface p-4",
        dimmed ? "opacity-60" : "",
      ].join(" ")}
    >
      {href ? (
        <Link href={href} className="block">
          {title}
        </Link>
      ) : (
        title
      )}

      {task.body ? (
        <p className="mt-2 text-[16px] leading-[22px] text-muted">{task.body}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip
          interactive={false}
          tone={deadline.overdue ? "danger" : deadline.none ? "muted" : "neutral"}
        >
          <span className="nums">{deadline.text}</span>
        </Chip>

        {task.priority === "high" ? (
          <Chip interactive={false} tone="warn">
            {TEXT.urgent}
          </Chip>
        ) : null}

        <Chip interactive={false} tone="muted">
          {STATUS_LABEL[task.status]}
        </Chip>

        {variant === "director" && task.assignee ? (
          <span className="text-[13px] leading-4 text-muted">{task.assignee.full_name}</span>
        ) : null}
      </div>

      {task.source_audio_path ? <AudioOriginal path={task.source_audio_path} /> : null}

      {task.source_transcript ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] leading-4 text-muted">
            {TEXT.transcriptSpoiler}
          </summary>
          <p className="mt-2 text-[14px] leading-[18px] text-muted">{task.source_transcript}</p>
        </details>
      ) : null}

      <StatusBanner task={task} declineReason={declineReason} />

      <div className="mt-4 flex flex-wrap gap-2">
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
          actions.sendMessage({
            taskId: task.id,
            companyId,
            text,
            meta: { is_question: true },
          });
          toast(TEXT.askedToast);
        }}
      />

      <DeclineSheet
        open={sheet === "decline"}
        onClose={close}
        onSubmit={(reason) =>
          actions.transition({ taskId: task.id, toStatus: "declined", reason })
        }
      />

      <ReportSheet
        open={sheet === "report"}
        onClose={close}
        onSubmit={(text) => {
          if (text) actions.sendMessage({ taskId: task.id, companyId, text });
          actions.complete({ taskId: task.id, fromStatus: task.status });
        }}
      />

      <ReworkSheet
        open={sheet === "rework"}
        onClose={close}
        onSubmit={(comment) =>
          actions.transition({ taskId: task.id, toStatus: "rework", comment })
        }
      />

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

function StatusBanner({
  task,
  declineReason,
}: {
  task: TaskWithPeople;
  declineReason?: string | null;
}) {
  if (task.status === "rework") {
    return (
      <p className="mt-3 rounded-[12px] border border-warn/50 bg-warn/10 px-3 py-2 text-[14px] leading-[18px] text-warn">
        {TEXT.reworkBanner}
      </p>
    );
  }
  if (task.status === "pending_review") {
    return <p className="mt-3 text-[14px] leading-[18px] text-muted">{TEXT.underReview}</p>;
  }
  if (task.status === "declined") {
    return (
      <p className="mt-3 text-[14px] leading-[18px] text-danger">
        Отказ{declineReason ? `: ${declineReason}` : ""}
      </p>
    );
  }
  if (task.status === "revoked") {
    return <p className="mt-3 text-[14px] leading-[18px] text-muted">{TEXT.revoked}</p>;
  }
  if (task.status === "done") {
    return <p className="mt-3 text-[14px] leading-[18px] text-ok">✓ {STATUS_LABEL.done}</p>;
  }
  return null;
}

/**
 * Exactly the table of docs/FRONTEND.md «Состояние задачи → набор кнопок».
 * Three buttons at most — принцип 2, not to be widened.
 */
function EmployeeActions({
  task,
  onOpen,
  actions,
}: {
  task: TaskWithPeople;
  onOpen: (sheet: OpenSheet) => void;
  actions: TaskActions;
}) {
  if (task.status === "sent") {
    return (
      <>
        <Button onClick={() => actions.transition({ taskId: task.id, toStatus: "accepted" })}>
          {BUTTON.accept}
        </Button>
        <Button variant="secondary" onClick={() => onOpen("ask")}>
          {BUTTON.ask}
        </Button>
        <Button variant="danger" onClick={() => onOpen("decline")}>
          {BUTTON.cant}
        </Button>
      </>
    );
  }

  // rework needs no second «Принял» — the tap sends accepted, then pending_review.
  if (task.status === "accepted" || task.status === "rework") {
    return <Button onClick={() => onOpen("report")}>{BUTTON.complete}</Button>;
  }

  return null;
}

function DirectorActions({
  task,
  onOpen,
  actions,
}: {
  task: TaskWithPeople;
  onOpen: (sheet: OpenSheet) => void;
  actions: TaskActions;
}) {
  const terminal =
    task.status === "done" || task.status === "revoked" || task.status === "declined";

  return (
    <>
      {task.status === "pending_review" ? (
        <>
          <Button onClick={() => actions.transition({ taskId: task.id, toStatus: "done" })}>
            {BUTTON.approve}
          </Button>
          <Button variant="secondary" onClick={() => onOpen("rework")}>
            {BUTTON.rework}
          </Button>
        </>
      ) : null}

      {task.status === "declined" ? (
        <>
          <Button onClick={() => actions.transition({ taskId: task.id, toStatus: "sent" })}>
            {BUTTON.insist}
          </Button>
          <Button variant="secondary" onClick={() => onOpen("revoke")}>
            {BUTTON.cancel}
          </Button>
        </>
      ) : null}

      {!terminal ? (
        <button
          type="button"
          className="min-h-[44px] px-2 text-[14px] leading-[18px] text-muted underline underline-offset-4"
          onClick={() => onOpen("revoke")}
        >
          {BUTTON.revoke}
        </button>
      ) : null}
    </>
  );
}
