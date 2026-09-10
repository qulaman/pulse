"use client";

import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskSkeleton } from "@/components/tasks/TaskSkeleton";
import { useTaskActions } from "@/lib/tasks/mutations";
import {
  inboxCounts,
  useDirectorInbox,
  useMe,
  type TaskWithPeople,
} from "@/lib/tasks/queries";
import { TEXT, verdict, type VerdictTone } from "@/lib/tasks/status-text";

const VERDICT_BG: Record<VerdictTone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

/**
 * Пульс, blocks 1–2 of docs/FRONTEND.md: the verdict line and «Требует вас».
 * Stacks in D-05 order — overdue, questions, review. Люди and Цифры недели
 * belong to the full Пульс, not here.
 */
export default function PulsePage() {
  const me = useMe();
  const inbox = useDirectorInbox();
  const actions = useTaskActions(me.data);

  const counts = inboxCounts(inbox.data);
  const line = verdict(counts);
  const loading = me.isLoading || inbox.isLoading;
  const companyId = me.data?.companyId ?? "";

  const section = (title: string, tasks: TaskWithPeople[]) =>
    tasks.length === 0 ? null : (
      <section className="mt-6">
        <h2 className="text-[19px] font-semibold leading-6">
          {title} <span className="nums text-muted">{tasks.length}</span>
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              variant="director"
              actions={actions}
              companyId={companyId}
              href={`/tasks/${task.id}`}
            />
          ))}
        </div>
      </section>
    );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <h1 className="text-[24px] font-bold leading-[30px]">Пульс</h1>

      <p
        className="mt-4 rounded-[16px] px-4 py-3 text-[16px] leading-[22px] font-medium text-bg"
        style={{ background: VERDICT_BG[line.tone] }}
      >
        {line.text}
      </p>

      {loading ? (
        <div className="mt-6">
          <TaskSkeleton />
        </div>
      ) : counts.total === 0 ? (
        <p className="mt-6 text-[16px] leading-[22px] text-muted">
          {TEXT.emptyInbox}. Новое покажу здесь
        </p>
      ) : (
        <>
          {section("Просрочки", inbox.data?.overdue ?? [])}
          {section("Вопросы", inbox.data?.questions ?? [])}
          {section("Приёмка", inbox.data?.review ?? [])}
        </>
      )}
    </main>
  );
}
