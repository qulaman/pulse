"use client";

import { useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskSkeleton } from "@/components/tasks/TaskSkeleton";
import { Chip } from "@/components/ui/Chip";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, useSentTasks, type TaskWithPeople } from "@/lib/tasks/queries";
import { STATUS_LABEL, type TaskStatus } from "@/lib/tasks/status-text";

type Filter = "active" | "review" | "closed" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "active", label: "В работе" },
  { key: "review", label: "На приёмке" },
  { key: "closed", label: "Закрытые" },
  { key: "all", label: "Все" },
];

const ACTIVE: TaskStatus[] = ["scheduled", "sent", "accepted", "in_progress", "rework"];
const CLOSED: TaskStatus[] = ["done", "declined", "revoked"];

function matches(task: TaskWithPeople, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "review") return task.status === "pending_review";
  if (filter === "closed") return CLOSED.includes(task.status);
  return ACTIVE.includes(task.status);
}

function dayKey(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 5 * 3_600_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

/**
 * «Отправленные»: everything the director has handed out, newest first, grouped by day.
 * Reading this list after a reload is the proof that a confirmed batch is persisted.
 */
export default function SentPage() {
  const me = useMe();
  const tasks = useSentTasks(me.data?.userId);
  const actions = useTaskActions(me.data);
  const [filter, setFilter] = useState<Filter>("active");

  const rows = useMemo(() => (tasks.data ?? []).filter((t) => matches(t, filter)), [tasks.data, filter]);
  const counts = useMemo(() => {
    const all = tasks.data ?? [];
    return {
      active: all.filter((t) => matches(t, "active")).length,
      review: all.filter((t) => matches(t, "review")).length,
      closed: all.filter((t) => matches(t, "closed")).length,
      all: all.length,
    };
  }, [tasks.data]);

  const groups = useMemo(() => {
    const map = new Map<string, TaskWithPeople[]>();
    for (const task of rows) {
      const key = dayKey(task.created_at);
      map.set(key, [...(map.get(key) ?? []), task]);
    }
    return [...map.entries()];
  }, [rows]);

  const loading = me.isLoading || tasks.isLoading;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Отправленные</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        {loading ? " " : `${counts.all} ${counts.all === 1 ? "поручение" : counts.all < 5 ? "поручения" : "поручений"} всего`}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f.key} tone={filter === f.key ? "accent" : "neutral"} onClick={() => setFilter(f.key)}>
            {f.label} <span className="nums opacity-70">{counts[f.key]}</span>
          </Chip>
        ))}
      </div>

      {loading ? (
        <div className="mt-6">
          <TaskSkeleton />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-[16px] border border-border bg-surface px-6 py-10 text-center">
          <Mascot state="calm" size={64} />
          <p className="mt-4 text-[16px] leading-[22px]">
            {filter === "all" ? "Пока ничего не отправлено" : "В этой стопке пусто"}
          </p>
          <p className="mt-1 text-[13px] leading-4 text-muted">Зажми кнопку и скажи, что нужно сделать</p>
        </div>
      ) : (
        groups.map(([day, items]) => (
          <section key={day} className="mt-6">
            <h2 className="nums text-[13px] font-medium leading-4 text-muted">{day}</h2>
            <div className="mt-2 flex flex-col gap-3">
              {items.map((task) => (
                <div key={task.id} data-testid="sent-task" data-status={task.status}>
                  <TaskCard
                    task={task}
                    variant="director"
                    actions={actions}
                    companyId={me.data?.companyId ?? ""}
                    href={`/tasks/${task.id}`}
                  />
                  <p className="sr-only">{STATUS_LABEL[task.status]}</p>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
