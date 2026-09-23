"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TasksListBone } from "@/components/ui/PageSkeletons";
import { aqtobeDay, humanAqtobe } from "@/lib/ai/time";
import { useTaskActions } from "@/lib/tasks/mutations";
import { activeOnly, sortByUrgency, useMe, useMyTasks } from "@/lib/tasks/queries";
import { isOverdue } from "@/lib/tasks/status-text";

function dayGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

function statusHint(status: string): string {
  if (status === "sent") return "Сначала реши: берёшь или нужен вопрос";
  if (status === "rework") return "Директор ждёт исправленный результат";
  return "Это главное дело прямо сейчас";
}

/** Employee focus mode: one decision, one task, one visible next step. */
export default function TasksAlternativePage() {
  const me = useMe();
  const tasks = useMyTasks(me.data?.userId);
  const actions = useTaskActions(me.data);
  const now = useMemo(() => new Date(), []);
  const [focusIndex, setFocusIndex] = useState(0);
  const [queueOpen, setQueueOpen] = useState(false);
  const loading = me.isLoading || tasks.isLoading;
  const active = useMemo(() => activeOnly(tasks.data), [tasks.data]);
  const actionable = useMemo(
    () => sortByUrgency(active.filter((task) => task.status !== "pending_review"), now),
    [active, now],
  );
  const waiting = useMemo(() => active.filter((task) => task.status === "pending_review"), [active]);
  const safeFocusIndex = Math.min(focusIndex, Math.max(0, actionable.length - 1));
  const focus = actionable[safeFocusIndex];

  const closedToday = useMemo(() => {
    const today = aqtobeDay(now);
    return (tasks.data ?? []).filter((task) => task.status === "done" && task.closed_at && aqtobeDay(new Date(task.closed_at)) === today).length;
  }, [tasks.data, now]);
  const overdue = actionable.filter((task) => isOverdue(task, now)).length;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-10 pt-4">
      <header>
        <p className="eyebrow text-accent">Режим фокуса</p>
        <h1 className="mt-1 text-[28px] font-bold leading-[34px]">{dayGreeting(now)}</h1>
        <p className="mt-1 text-[14px] text-muted">
          {loading ? "Собираю дела…" : actionable.length ? `${actionable.length} требуют действия${overdue ? ` · ${overdue} горит` : ""}` : "Срочных действий нет"}
        </p>
      </header>

      {loading ? <TasksListBone /> : focus ? (
        <>
          <section className="mt-6">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: isOverdue(focus, now) ? "var(--danger)" : "var(--accent)" }}>
                  {isOverdue(focus, now) ? "Сначала разберись с этим" : "Сейчас"}
                </p>
                <p className="mt-1 text-[13px] text-muted">{statusHint(focus.status)}</p>
              </div>
              <span className="nums shrink-0 text-[12px] text-muted">{safeFocusIndex + 1} из {actionable.length}</span>
            </div>

            <TaskCard task={focus} variant="employee" actions={actions} companyId={me.data?.companyId ?? ""} href={`/tasks/${focus.id}`} />

            {actionable.length > 1 ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={safeFocusIndex === 0} onClick={() => setFocusIndex(Math.max(0, safeFocusIndex - 1))} className="min-h-[44px] rounded-[12px] border border-border text-[13px] text-muted disabled:opacity-25">← Назад</button>
                <button type="button" disabled={safeFocusIndex >= actionable.length - 1} onClick={() => setFocusIndex(Math.min(actionable.length - 1, safeFocusIndex + 1))} className="min-h-[44px] rounded-[12px] border border-border text-[13px] text-muted disabled:opacity-25">Следующее →</button>
              </div>
            ) : null}
          </section>

          <section className="mt-7">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold">Маршрут на сегодня</h2>
              <span className="text-[12px] text-muted">{closedToday} готово</span>
            </div>
            <div className="mt-3 flex items-center gap-1.5" aria-label={`${closedToday} завершено, ${actionable.length} осталось`}>
              {Array.from({ length: Math.min(12, closedToday + actionable.length) }, (_, index) => (
                <span key={index} className="h-2 flex-1 rounded-full" style={{ background: index < closedToday ? "var(--accent)" : index === closedToday ? "var(--warn)" : "var(--border)" }} />
              ))}
            </div>
            <p className="mt-2 text-[12px] text-muted">Готовое остаётся позади. Мы показываем только следующий шаг.</p>
          </section>
        </>
      ) : (
        <section className="mt-6 flex flex-col items-center rounded-[24px] border border-accent/25 bg-surface px-6 py-9 text-center">
          <Mascot state={closedToday ? "happy" : "calm"} size={76} />
          <h2 className="mt-4 text-[20px] font-bold">На вашей стороне всё сделано</h2>
          <p className="mt-1 text-[14px] text-muted">{waiting.length ? `${waiting.length} ${waiting.length === 1 ? "результат ждёт" : "результата ждут"} директора` : "Новых дел пока нет"}</p>
        </section>
      )}

      {!loading && waiting.length ? (
        <section className="mt-7">
          <div className="flex items-baseline justify-between"><h2 className="text-[18px] font-bold">Передано директору</h2><span className="nums text-[12px] text-muted">{waiting.length}</span></div>
          <div className="mt-3 overflow-hidden rounded-[18px] border border-border bg-surface">
            {waiting.map((task, index) => (
              <Link key={task.id} href={`/tasks/${task.id}`} className={`flex min-h-[62px] items-center gap-3 px-4 ${index ? "border-t border-border/70" : ""}`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-muted" />
                <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-semibold">{task.title}</p><p className="mt-0.5 text-[12px] text-muted">Можно не держать в голове</p></div>
                <span className="text-[12px] text-muted">ждём</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && actionable.length > 1 ? (
        <section className="mt-7">
          <button type="button" onClick={() => setQueueOpen((open) => !open)} aria-expanded={queueOpen} className="flex min-h-[48px] w-full items-center justify-between border-y border-border text-left">
            <span className="text-[15px] font-semibold">Посмотреть всю очередь</span><span className="text-[13px] text-muted">{actionable.length} {queueOpen ? "↑" : "↓"}</span>
          </button>
          {queueOpen ? (
            <div className="divide-y divide-border/70">
              {actionable.map((task, index) => (
                <button key={task.id} type="button" onClick={() => { setFocusIndex(index); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex min-h-[64px] w-full items-center gap-3 py-3 text-left">
                  <span className="nums flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-[12px] text-muted">{index + 1}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-semibold">{task.title}</p><p className="mt-1 text-[12px] text-muted">{task.deadline ? humanAqtobe(new Date(task.deadline), now) : "без срока"}</p></div>
                  {isOverdue(task, now) ? <span className="text-[11px] font-semibold text-danger">горит</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
