"use client";

import { TaskCard, type TaskCardVariant } from "@/components/tasks/TaskCard";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { STATUS_LABEL, type TaskStatus } from "@/lib/tasks/status-text";

const STATUSES: TaskStatus[] = [
  "scheduled",
  "sent",
  "accepted",
  "in_progress",
  "pending_review",
  "done",
  "rework",
  "declined",
  "revoked",
];

const HOUR = 3600_000;

/** Nothing here touches the network — the sandbox logs what a real tap would send. */
const actions: TaskActions = {
  transition: (input) => console.log("transition", input),
  complete: (input) => console.log("complete", input),
  revoke: (taskId) => console.log("revoke", taskId),
  extend: (input) => console.log("extend", input),
  reassign: (input) => console.log("reassign", input),
  sendMessage: (input) => console.log("sendMessage", input),
  remove: (taskId) => console.log("remove", taskId),
  busy: false,
};

function fixture(status: TaskStatus, index: number): TaskWithPeople {
  const overdue = index % 3 === 0;
  const undated = index % 3 === 1;

  return {
    id: `fixture-${status}`,
    company_id: "company",
    author_id: "director",
    assignee_id: "employee",
    parent_task_id: null,
    group_id: null,
    title: "Подготовить КП для Казхрома",
    body: index % 2 === 0 ? "Смета и сроки, копия — в почту снабжения" : null,
    deadline: undated
      ? null
      : new Date(Date.now() + (overdue ? -2 * HOUR : 6 * HOUR)).toISOString(),
    priority: index % 4 === 0 ? "high" : "normal",
    status,
    source: "voice",
    source_audio_path: index % 2 === 0 ? "company/director/fixture.webm" : null,
    source_transcript:
      index % 2 === 0 ? "Марат, подготовь КП для Казхрома к завтрашнему вечеру" : null,
    scheduled_send_at: null,
    recurrence_rule_id: null,
    accepted_at: null,
    completed_at: null,
    closed_at: null,
    created_at: new Date(Date.now() - 26 * HOUR).toISOString(),
    updated_at: new Date().toISOString(),
    assignee: { full_name: "Марат Ахметов" },
    author: { full_name: "Директор" },
  };
}

function Column({ variant }: { variant: TaskCardVariant }) {
  return (
    <div className="flex-1">
      <h2 className="mb-3 text-[19px] font-semibold leading-6">
        {variant === "employee" ? "Сотрудник" : "Директор"}
      </h2>
      <div className="flex flex-col gap-4">
        {STATUSES.map((status, index) => (
          <div key={status}>
            <p className="mb-1 text-[13px] leading-4 text-muted">
              {status} — {STATUS_LABEL[status]}
            </p>
            <TaskCard
              task={fixture(status, index)}
              variant={variant}
              actions={actions}
              companyId="company"
              declineReason={status === "declined" ? "Занят срочным. Уехал на объект" : null}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TaskCardSandbox() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="text-[24px] font-bold leading-[30px]">Карточка задачи</h1>
      <p className="mt-2 text-[14px] leading-[18px] text-muted">
        Все статусы × оба варианта. Кнопки пишут действие в консоль.
      </p>

      <div className="mt-6 flex flex-col gap-8 md:flex-row">
        <Column variant="employee" />
        <Column variant="director" />
      </div>

    </main>
  );
}
