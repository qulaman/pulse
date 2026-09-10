"use client";

import Link from "next/link";

import { Mascot, type MascotState } from "@/components/brand/Mascot";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskSkeleton } from "@/components/tasks/TaskSkeleton";
import { useTaskActions } from "@/lib/tasks/mutations";
import {
  inboxCounts,
  useDirectorInbox,
  useMe,
  type TaskWithPeople,
} from "@/lib/tasks/queries";
import { verdict, type VerdictTone } from "@/lib/tasks/status-text";

const VERDICT_STYLE: Record<VerdictTone, { border: string; glow: string; mascot: MascotState; sub: string }> = {
  ok: {
    border: "color-mix(in srgb, var(--ok) 45%, transparent)",
    glow: "color-mix(in srgb, var(--ok) 12%, transparent)",
    mascot: "happy",
    sub: "Ничего не требует внимания. Зажми кнопку внизу и скажи, что нужно сделать",
  },
  warn: {
    border: "color-mix(in srgb, var(--warn) 55%, transparent)",
    glow: "color-mix(in srgb, var(--warn) 12%, transparent)",
    mascot: "thinking",
    sub: "Есть что разобрать — всё ниже, по порядку срочности",
  },
  danger: {
    border: "color-mix(in srgb, var(--danger) 55%, transparent)",
    glow: "color-mix(in srgb, var(--danger) 12%, transparent)",
    mascot: "thinking",
    sub: "Сначала просрочки, потом вопросы и приёмка",
  },
};

function firstName(fullName: string | undefined): string {
  return fullName?.trim().split(/\s+/)[0] ?? "";
}

/**
 * Пульс, blocks 1–2 of docs/FRONTEND.md: the verdict and «Требует вас».
 * Stacks in D-05 order — overdue, questions, review. Люди and Цифры недели
 * belong to the full Пульс, not here.
 */
export default function PulsePage() {
  const me = useMe();
  const inbox = useDirectorInbox();
  const actions = useTaskActions(me.data);

  const counts = inboxCounts(inbox.data);
  const line = verdict(counts);
  const style = VERDICT_STYLE[line.tone];
  const loading = me.isLoading || inbox.isLoading;
  const companyId = me.data?.companyId ?? "";

  const section = (title: string, tasks: TaskWithPeople[], tone: VerdictTone) =>
    tasks.length === 0 ? null : (
      <section className="mt-7">
        <h2 className="flex items-center gap-2 text-[19px] font-semibold leading-6">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: `var(--${tone === "ok" ? "ok" : tone})` }}
          />
          {title}
          <span className="nums rounded-full bg-surface-2 px-2 text-[13px] leading-5 text-muted">
            {tasks.length}
          </span>
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
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <p className="text-[13px] leading-4 text-muted">
        {me.data ? `Здравствуйте, ${firstName(me.data.fullName)}` : " "}
      </p>
      <h1 className="mt-1 text-[24px] font-bold leading-[30px]">Пульс</h1>

      <section
        className="mt-4 flex items-center gap-4 rounded-[16px] border bg-surface p-4"
        style={{ borderColor: style.border, background: `linear-gradient(135deg, ${style.glow}, transparent 60%), var(--surface)` }}
        aria-live="polite"
      >
        <Mascot state={loading ? "thinking" : style.mascot} size={56} />
        <div className="min-w-0">
          <p className="text-[19px] font-semibold leading-6">{loading ? "Смотрю, что нового…" : line.text}</p>
          <p className="mt-1 text-[13px] leading-4 text-muted">{loading ? " " : style.sub}</p>
        </div>
      </section>

      <Link
        href="/sent"
        className="mt-3 flex min-h-[48px] items-center justify-between rounded-[16px] border border-border bg-surface px-4 text-[16px] leading-[22px]"
      >
        Отправленные
        <span className="text-[13px] leading-4 text-muted">все поручения по дням ›</span>
      </Link>

      {loading ? (
        <div className="mt-6">
          <TaskSkeleton />
        </div>
      ) : counts.total === 0 ? null : (
        <>
          {section("Просрочки", inbox.data?.overdue ?? [], "danger")}
          {section("Вопросы", inbox.data?.questions ?? [], "warn")}
          {section("Приёмка", inbox.data?.review ?? [], "ok")}
        </>
      )}
    </main>
  );
}
