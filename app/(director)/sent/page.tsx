"use client";

import { useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { TaskCapsule } from "@/components/tasks/TaskCapsule";
import { SentListBone } from "@/components/ui/PageSkeletons";
import { Chip } from "@/components/ui/Chip";
import { useDirectorInbox, useMe, useSentTasks, type TaskWithPeople } from "@/lib/tasks/queries";
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

/**
 * «Задачи»: everything the director has handed out, newest first, one capsule per task —
 * who, when it is due, when it was given. Reading this list after a reload is the
 * proof that a confirmed batch is persisted.
 */
export default function SentPage() {
  const me = useMe();
  const tasks = useSentTasks(me.data?.userId);
  // open questions mark their capsules — the same stack Пульс reads, already cached
  const inbox = useDirectorInbox();
  const questionIds = useMemo(() => new Set((inbox.data?.questions ?? []).map((t) => t.id)), [inbox.data]);
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const now = useMemo(() => new Date(), []);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (tasks.data ?? []).filter(
      (t) =>
        matches(t, filter) &&
        (!needle || t.title.toLowerCase().includes(needle) || (t.assignee?.full_name ?? "").toLowerCase().includes(needle)),
    );
  }, [tasks.data, filter, query]);
  const counts = useMemo(() => {
    const all = tasks.data ?? [];
    return {
      active: all.filter((t) => matches(t, "active")).length,
      review: all.filter((t) => matches(t, "review")).length,
      closed: all.filter((t) => matches(t, "closed")).length,
      all: all.length,
    };
  }, [tasks.data]);

  const loading = me.isLoading || tasks.isLoading;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Задачи</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        {loading ? " " : `${counts.all} ${counts.all === 1 ? "задача" : counts.all < 5 ? "задачи" : "задач"} всего`}
      </p>

      <label className="mt-4 flex min-h-[44px] items-center gap-2 rounded-[12px] border border-border bg-surface-2 px-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Название или имя"
          aria-label="Поиск по задачам"
          className="min-w-0 flex-1 bg-transparent text-[16px] leading-[22px] text-text outline-none placeholder:text-muted"
        />
        {query ? (
          <button type="button" aria-label="Очистить" onClick={() => setQuery("")} className="text-[16px] text-muted">
            ×
          </button>
        ) : null}
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f.key} tone={filter === f.key ? "accent" : "neutral"} onClick={() => setFilter(f.key)}>
            {f.label} <span className="nums opacity-70">{counts[f.key]}</span>
          </Chip>
        ))}
      </div>

      {loading ? (
        <SentListBone />
      ) : rows.length === 0 ? (
        <div className="mt-6 flex flex-col items-center card px-6 py-10 text-center">
          <Mascot state="calm" size={64} />
          <p className="mt-4 text-[16px] leading-[22px]">
            {query ? "Ничего не нашёл" : filter === "all" ? "Пока ничего не отправлено" : "В этой стопке пусто"}
          </p>
          <p className="mt-1 text-[13px] leading-4 text-muted">Зажми кнопку и скажи, что нужно сделать</p>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2">
          {rows.map((task) => (
            <div key={task.id} className="card-in" data-testid="sent-task" data-status={task.status}>
              <TaskCapsule task={task} now={now} question={questionIds.has(task.id)} />
              <p className="sr-only">{STATUS_LABEL[task.status]}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
