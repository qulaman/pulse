"use client";

import { useMemo } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { TaskCard } from "@/components/tasks/TaskCard";
import { isUrgentNow } from "@/components/tasks/TaskChrome";
import { Trace, TraceHeading, TraceLeaf, TraceNow } from "@/components/tasks/Trace";
import { TasksListBone } from "@/components/ui/PageSkeletons";
import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { groupTasks, nearestDeadline, overdueCount, TIME_BUCKETS } from "@/lib/tasks/grouping";
import { useTaskActions } from "@/lib/tasks/mutations";
import { activeOnly, useMe, useMyTasks } from "@/lib/tasks/queries";
import { isOverdue, pluralRu, TEXT } from "@/lib/tasks/status-text";
import { toneOf, type Tone } from "@/lib/tasks/tone";

/** «Просрочено» and «Срочно» burn, «Сегодня» is the day itself, the rest are quiet piles. */
// «На приёмке» у сотрудника — не «горит», а «не твой ход»: тихая стопка внизу
const HEAD_TONE: Record<string, Tone> = { overdue: "danger", urgent: "warn", review: "muted", today: "accent" };

/**
 * «Мои дела»: only what is still open, grouped the way «Задачи» директора are grouped —
 * просрочено → сегодня → завтра → на неделе → позже → без срока (D-05). The three
 * buttons stay on every card (принцип 2): this screen is where the work is done, not a
 * place to browse. What was closed today is one quiet line at the bottom.
 */
export default function TasksPage() {
  const me = useMe();
  const tasks = useMyTasks(me.data?.userId);
  const actions = useTaskActions(me.data);
  const now = useMemo(() => new Date(), []);

  const loading = me.isLoading || tasks.isLoading;
  const items = useMemo(() => activeOnly(tasks.data), [tasks.data]);
  const groups = useMemo(() => groupTasks(items, "deadline", now), [items, now]);
  const overdue = useMemo(() => overdueCount(items, now), [items, now]);
  const soonest = useMemo(() => nearestDeadline(items, now), [items, now]);
  // the tick divides «чей ход» from «когда»: it stands before the first dated pile
  const nowIndex = useMemo(() => groups.findIndex((group) => TIME_BUCKETS.includes(group.key as never)), [groups]);
  const closedToday = useMemo(() => {
    const today = aqtobeDay(now);
    return (tasks.data ?? []).filter(
      (task) => task.status === "done" && task.closed_at && aqtobeDay(new Date(task.closed_at)) === today,
    ).length;
  }, [tasks.data, now]);

  const summary =
    overdue > 0
      ? `${overdue} ${pluralRu(overdue, ["просрочено", "просрочены", "просрочено"])}`
      : soonest
        ? `ближайший срок ${humanAqtobe(new Date(soonest), now)}`
        : "сроков нет";

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-10 pt-4">
      <h1 className="text-[24px] font-bold leading-[30px]">Мои дела</h1>
      <p className="mt-1 text-[13px] leading-4">
        {loading ? (
          " "
        ) : items.length === 0 ? (
          <span className="text-muted">{closedToday > 0 ? `Сегодня закрыто: ${closedToday}` : " "}</span>
        ) : (
          <>
            <span className="text-muted">
              {items.length} {pluralRu(items.length, ["дело", "дела", "дел"])} ·{" "}
            </span>
            <span style={{ color: overdue > 0 ? "var(--danger)" : "var(--text-muted)" }}>{summary}</span>
          </>
        )}
      </p>

      {loading ? (
        <TasksListBone />
      ) : items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center card px-6 py-10 text-center">
          <Mascot state={closedToday > 0 ? "happy" : "calm"} size={72} />
          <p className="mt-4 text-[16px] leading-[22px]">{TEXT.emptyTasks}</p>
        </div>
      ) : (
        <>
          <Trace className="mt-4">
            {groups.map((group, index) => (
              <section key={group.key}>
                {/* the tick of «сейчас»: above it the day is already behind, below it still ahead */}
                {index === nowIndex ? <TraceNow now={now} className={index === 0 ? "mt-1 mb-3" : "mt-7 mb-3"} /> : null}
                <TraceHeading
                  title={group.title}
                  count={group.tasks.length}
                  tone={HEAD_TONE[group.key] ?? "muted"}
                  className={index === 0 || index === nowIndex ? "mt-1" : "mt-7"}
                />
                <div className="mt-3 flex flex-col gap-4">
                  {group.tasks.map((task) => {
                    const overdue = isOverdue(task, now);
                    const burning = overdue || isUrgentNow(task);
                    return (
                      <TraceLeaf
                        key={task.id}
                        className="card-in"
                        tone={overdue ? "danger" : isUrgentNow(task) ? "warn" : toneOf(task.status, false)}
                        hollow={task.status === "pending_review" || task.status === "scheduled"}
                        halo={burning}
                      >
                        <TaskCard
                          task={task}
                          variant="employee"
                          actions={actions}
                          companyId={me.data?.companyId ?? ""}
                          href={`/tasks/${task.id}`}
                          bare
                          showStatus={group.key !== "overdue" && group.key !== "review"}
                        />
                      </TraceLeaf>
                    );
                  })}
                </div>
              </section>
            ))}
            {nowIndex === -1 && groups.length > 0 ? <TraceNow now={now} className="mt-7" /> : null}
          </Trace>
          {closedToday > 0 ? (
            <p className="mt-6 text-center text-[13px] leading-4 text-muted">
              Сегодня закрыто: <span className="nums">{closedToday}</span>
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
