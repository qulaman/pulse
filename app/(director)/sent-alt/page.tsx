"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { SentListBone } from "@/components/ui/PageSkeletons";
import { humanAqtobe } from "@/lib/ai/time";
import { useDirectorInbox, useMe, useSentTasks, type TaskWithPeople } from "@/lib/tasks/queries";
import { deadlineLabel, isOverdue, SHORT_STATUS, type TaskStatus } from "@/lib/tasks/status-text";

const OPEN: TaskStatus[] = ["scheduled", "sent", "accepted", "in_progress", "rework", "pending_review"];

type AttentionReason = "review" | "question" | "overdue" | "unaccepted";
type AttentionItem = { task: TaskWithPeople; reason: AttentionReason };

const REASON: Record<AttentionReason, { eyebrow: string; prompt: string; color: string }> = {
  review: { eyebrow: "ВАШ ХОД · ПРИЁМКА", prompt: "Проверить результат", color: "var(--accent)" },
  question: { eyebrow: "ВАШ ХОД · ВОПРОС", prompt: "Ответить сотруднику", color: "var(--warn)" },
  overdue: { eyebrow: "НУЖНО ВМЕШАТЬСЯ", prompt: "Разобраться со сроком", color: "var(--danger)" },
  unaccepted: { eyebrow: "НЕТ РЕАКЦИИ", prompt: "Проверить доставку", color: "var(--warn)" },
};

function reasonOf(task: TaskWithPeople, questions: Set<string>, now: Date): AttentionReason | null {
  if (task.status === "pending_review") return "review";
  if (questions.has(task.id)) return "question";
  if (isOverdue(task, now)) return "overdue";
  if (task.status === "sent") return "unaccepted";
  return null;
}

function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "Без исполнителя";
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

/** A director's cockpit: decisions first, people second, the task register last. */
export default function SentAlternativePage() {
  const me = useMe();
  const tasks = useSentTasks(me.data?.userId);
  const inbox = useDirectorInbox(me.data);
  const [attentionIndex, setAttentionIndex] = useState(0);
  const [registryOpen, setRegistryOpen] = useState(false);
  const now = useMemo(() => new Date(), []);
  const loading = me.isLoading || tasks.isLoading;
  const questionIds = useMemo(() => new Set((inbox.data?.questions ?? []).map((task) => task.id)), [inbox.data]);
  const openTasks = useMemo(() => (tasks.data ?? []).filter((task) => OPEN.includes(task.status)), [tasks.data]);

  const attention = useMemo<AttentionItem[]>(() => {
    const weight: Record<AttentionReason, number> = { review: 0, question: 1, overdue: 2, unaccepted: 3 };
    return openTasks
      .map((task) => ({ task, reason: reasonOf(task, questionIds, now) }))
      .filter((item): item is AttentionItem => item.reason !== null)
      .sort((a, b) => weight[a.reason] - weight[b.reason]);
  }, [openTasks, questionIds, now]);

  const people = useMemo(() => {
    const map = new Map<string, { name: string; tasks: number; attention: number; overdue: number }>();
    for (const task of openTasks) {
      const name = task.assignee?.full_name ?? "Без исполнителя";
      const row = map.get(name) ?? { name, tasks: 0, attention: 0, overdue: 0 };
      row.tasks += 1;
      if (reasonOf(task, questionIds, now)) row.attention += 1;
      if (isOverdue(task, now)) row.overdue += 1;
      map.set(name, row);
    }
    return [...map.values()].sort((a, b) => b.attention - a.attention || b.tasks - a.tasks || a.name.localeCompare(b.name, "ru"));
  }, [openTasks, questionIds, now]);

  const plan = useMemo(() => {
    const day = 24 * 60 * 60 * 1000;
    return openTasks.reduce(
      (acc, task) => {
        if (!task.deadline) acc.noDeadline += 1;
        else {
          const delta = new Date(task.deadline).getTime() - now.getTime();
          if (delta <= day) acc.today += 1;
          else if (delta <= 7 * day) acc.week += 1;
          else acc.later += 1;
        }
        return acc;
      },
      { today: 0, week: 0, later: 0, noDeadline: 0 },
    );
  }, [openTasks, now]);

  const current = attention.length ? attention[Math.min(attentionIndex, attention.length - 1)] : null;
  const currentMeta = current ? REASON[current.reason] : null;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-4">
      <header>
        <p className="eyebrow text-accent">Командный центр</p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold leading-[34px]">Добрый день</h1>
            <p className="mt-1 text-[14px] text-muted">{loading ? "Собираю картину…" : `${openTasks.length} в работе · ${people.length} человек`}</p>
          </div>
          {!loading ? (
            <div className="text-right">
              <span className="nums block text-[28px] font-bold leading-8" style={{ color: attention.length ? "var(--warn)" : "var(--accent)" }}>{attention.length}</span>
              <span className="text-[11px] uppercase tracking-wide text-muted">нужны вы</span>
            </div>
          ) : null}
        </div>
      </header>

      {loading ? <SentListBone /> : current && currentMeta ? (
        <section className="relative mt-6 overflow-hidden rounded-[24px] border border-border bg-surface p-5">
          <span className="absolute inset-y-0 left-0 w-1" style={{ background: currentMeta.color }} aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold tracking-[0.08em]" style={{ color: currentMeta.color }}>{currentMeta.eyebrow}</p>
            <span className="nums text-[12px] text-muted">{attentionIndex + 1} / {attention.length}</span>
          </div>
          <h2 className="mt-4 text-[24px] font-bold leading-[30px]">{current.task.title}</h2>
          <p className="mt-2 text-[15px] text-muted">
            {firstName(current.task.assignee?.full_name)}
            <span className="mx-2 opacity-40">·</span>
            {current.task.deadline ? deadlineLabel(current.task, now).text : "без срока"}
          </p>
          <Link href={`/tasks/${current.task.id}`} className="mt-6 flex min-h-[52px] items-center justify-between rounded-[14px] bg-accent px-4 font-semibold text-bg">
            {currentMeta.prompt}<Arrow />
          </Link>
          {attention.length > 1 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={attentionIndex === 0} onClick={() => setAttentionIndex((index) => Math.max(0, index - 1))} className="min-h-[44px] rounded-[12px] text-[13px] text-muted disabled:opacity-25">← Предыдущее</button>
              <button type="button" disabled={attentionIndex >= attention.length - 1} onClick={() => setAttentionIndex((index) => Math.min(attention.length - 1, index + 1))} className="min-h-[44px] rounded-[12px] text-[13px] text-muted disabled:opacity-25">Следующее →</button>
            </div>
          ) : null}
        </section>
      ) : !loading ? (
        <section className="mt-6 flex items-center gap-4 rounded-[24px] border border-accent/25 bg-surface p-5">
          <Mascot state="calm" size={54} />
          <div><h2 className="text-[18px] font-semibold">Вашего решения ничего не ждёт</h2><p className="mt-1 text-[13px] text-muted">Команда работает, можно не вмешиваться</p></div>
        </section>
      ) : null}

      {!loading ? (
        <>
          <section className="mt-7">
            <div className="flex items-baseline justify-between"><h2 className="text-[18px] font-bold">Команда</h2><span className="text-[12px] text-muted">нагрузка и риски</span></div>
            <div className="mt-3 overflow-hidden rounded-[18px] border border-border bg-surface">
              {people.length ? people.slice(0, 6).map((person, index) => {
                const color = person.overdue ? "var(--danger)" : person.attention ? "var(--warn)" : "var(--accent)";
                return (
                  <div key={person.name} className={`flex min-h-[62px] items-center gap-3 px-4 ${index ? "border-t border-border/70" : ""}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-[13px] font-bold" style={{ color }}>{firstName(person.name).slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-semibold">{firstName(person.name)}</p><p className="mt-0.5 text-[12px] text-muted">{person.tasks} в работе</p></div>
                    {person.attention ? <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>{person.overdue ? `${person.overdue} просроч.` : `${person.attention} сигнал`}</span> : <span className="text-[12px] text-accent">в порядке</span>}
                  </div>
                );
              }) : <p className="px-4 py-6 text-center text-[13px] text-muted">Активных задач нет</p>}
            </div>
          </section>

          <section className="mt-7">
            <div className="flex items-baseline justify-between"><h2 className="text-[18px] font-bold">Горизонт</h2><span className="text-[12px] text-muted">по срокам</span></div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[{ n: plan.today, t: "24 часа" }, { n: plan.week, t: "7 дней" }, { n: plan.later, t: "позже" }, { n: plan.noDeadline, t: "без срока" }].map((item) => (
                <div key={item.t} className="rounded-[14px] bg-surface px-2 py-3 text-center"><span className="nums block text-[20px] font-bold">{item.n}</span><span className="mt-1 block text-[11px] leading-3 text-muted">{item.t}</span></div>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <button type="button" onClick={() => setRegistryOpen((open) => !open)} aria-expanded={registryOpen} className="flex min-h-[48px] w-full items-center justify-between border-y border-border text-left">
              <span className="text-[15px] font-semibold">Все поручения</span><span className="text-[13px] text-muted">{openTasks.length} {registryOpen ? "↑" : "↓"}</span>
            </button>
            {registryOpen ? <div className="divide-y divide-border/70">{openTasks.map((task) => <Link key={task.id} href={`/tasks/${task.id}`} className="flex min-h-[64px] items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-[15px] font-semibold">{task.title}</p><p className="mt-1 truncate text-[12px] text-muted">{firstName(task.assignee?.full_name)} · {SHORT_STATUS[task.status]}</p></div><span className="nums shrink-0 text-[12px] text-muted">{task.deadline ? humanAqtobe(new Date(task.deadline), now) : "—"}</span></Link>)}</div> : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
