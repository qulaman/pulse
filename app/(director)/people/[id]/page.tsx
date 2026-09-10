"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskSkeleton } from "@/components/tasks/TaskSkeleton";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { humanAqtobe } from "@/lib/ai/time";
import {
  AVAILABILITY_LABEL,
  ROLE_LABEL,
  initialsOf,
  usePerson,
  usePersonMessages,
} from "@/lib/people/queries";
import { useComposeStore } from "@/lib/store/compose";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, useMyTasks, type TaskWithPeople } from "@/lib/tasks/queries";
import { STATUS_LABEL, isOverdue, type TaskStatus } from "@/lib/tasks/status-text";

const OPEN: TaskStatus[] = ["scheduled", "sent", "accepted", "in_progress", "rework"];
const CLOSED: TaskStatus[] = ["done", "declined", "revoked"];

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: "danger" | "ok" }) {
  return (
    <div className="rounded-[12px] bg-surface-2 px-3 py-2 text-center">
      <p
        className="nums text-[24px] font-bold leading-[30px]"
        style={tone ? { color: tone === "danger" ? "var(--danger)" : "var(--ok)" } : undefined}
      >
        {value}
      </p>
      <p className="text-[11px] leading-4 text-muted">{label}</p>
    </div>
  );
}

/**
 * A person's card for the director (FRONTEND «Пульс» п.4): who they are, how loaded,
 * every task on them with the director's own buttons, and what they last said.
 * Editing the roster entry is one tap away, not the card itself.
 */
export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const person = usePerson(id);
  const tasks = useMyTasks(id);
  const messages = usePersonMessages(id);
  const actions = useTaskActions(me.data);
  const compose = useComposeStore((state) => state.request);
  const [showClosed, setShowClosed] = useState(false);

  // the clock is read once per mount: a lazy initializer is allowed where render is not
  const [now] = useState(() => Date.now());
  const groups = useMemo(() => {
    const all = tasks.data ?? [];
    return {
      open: all.filter((t) => OPEN.includes(t.status)),
      review: all.filter((t) => t.status === "pending_review"),
      closed: all.filter((t) => CLOSED.includes(t.status)),
      overdue: all.filter((t) => isOverdue(t)).length,
      done30: all.filter(
        (t) => t.status === "done" && t.closed_at && now - new Date(t.closed_at).getTime() < 30 * 86_400_000,
      ).length,
    };
  }, [tasks.data, now]);

  if (person.isLoading) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
        <TaskSkeleton count={2} />
      </main>
    );
  }
  if (!person.data) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
        <Link href="/people" className="text-[13px] leading-4 text-muted">← Сотрудники</Link>
        <p className="mt-4 text-[16px] leading-[22px] text-muted">Сотрудник не найден</p>
      </main>
    );
  }

  const p = person.data;
  const dative = p.aliases[0] ?? p.full_name.split(/\s+/)[0] ?? p.full_name;

  const renderList = (list: TaskWithPeople[]) => (
    <div className="flex flex-col gap-3">
      {list.map((task) => (
        <div key={task.id} className="card-in">
          <TaskCard task={task} variant="director" actions={actions} companyId={me.data?.companyId ?? ""} href={`/tasks/${task.id}`} />
        </div>
      ))}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <Link href="/people" className="text-[13px] leading-4 text-muted">← Сотрудники</Link>

      <section className="mt-3 rounded-[16px] border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[22px] font-semibold text-bg"
            style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
          >
            {initialsOf(p.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-bold leading-[30px]">{p.full_name}</h1>
            {p.position ? <p className="text-[16px] leading-[22px] text-muted">{p.position}</p> : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone="neutral" interactive={false}>{ROLE_LABEL[p.role]}</Chip>
              {p.availability !== "active" ? (
                <Chip tone="warn" interactive={false}>{AVAILABILITY_LABEL[p.availability]}</Chip>
              ) : null}
              {!p.is_active ? <Chip tone="danger" interactive={false}>Не работает</Chip> : null}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat value={tasks.isLoading ? "…" : groups.open.length + groups.review.length} label="в работе" />
          <Stat value={tasks.isLoading ? "…" : groups.overdue} label="просрочено" tone={groups.overdue > 0 ? "danger" : undefined} />
          <Stat value={tasks.isLoading ? "…" : groups.done30} label="закрыто за 30 дн." tone={groups.done30 > 0 ? "ok" : undefined} />
        </div>

        <div className="mt-4 flex gap-2">
          <Button block onClick={() => compose(`${dative}, `)}>
            Дать задачу
          </Button>
          <Link href={`/people/${p.id}/edit`} className="shrink-0">
            <Button variant="secondary">Редактировать</Button>
          </Link>
        </div>
        {p.aliases.length > 0 ? (
          <p className="mt-3 text-[13px] leading-4 text-muted">В речи: {p.aliases.join(", ")}</p>
        ) : null}
      </section>

      <section className="mt-6">
        <h2 className="flex items-center gap-2 text-[19px] font-semibold leading-6">
          Задачи
          {!tasks.isLoading ? (
            <span className="nums rounded-full bg-surface-2 px-2 text-[13px] leading-5 text-muted">
              {groups.open.length + groups.review.length}
            </span>
          ) : null}
        </h2>
        <div className="mt-3">
          {tasks.isLoading ? (
            <TaskSkeleton />
          ) : groups.open.length + groups.review.length === 0 ? (
            <div className="flex items-center gap-3 rounded-[16px] border border-border bg-surface px-4 py-3">
              <Mascot state="calm" size={44} />
              <p className="text-[16px] leading-[22px] text-muted">Открытых задач нет. Дай задачу голосом или текстом</p>
            </div>
          ) : (
            <>
              {groups.review.length > 0 ? (
                <>
                  <p className="mb-2 text-[13px] leading-4 text-muted">На приёмке</p>
                  {renderList(groups.review)}
                </>
              ) : null}
              {groups.open.length > 0 ? (
                <>
                  <p className={`mb-2 text-[13px] leading-4 text-muted ${groups.review.length > 0 ? "mt-4" : ""}`}>В работе</p>
                  {renderList(groups.open)}
                </>
              ) : null}
            </>
          )}
        </div>

        {groups.closed.length > 0 ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowClosed((v) => !v)}
              className="text-[13px] leading-4 text-muted"
              aria-expanded={showClosed}
            >
              {showClosed ? "Скрыть закрытые" : `Закрытые · ${groups.closed.length}`}
            </button>
            {showClosed ? <div className="mt-3">{renderList(groups.closed)}</div> : null}
          </div>
        ) : null}
      </section>

      <section className="mt-6">
        <h2 className="text-[19px] font-semibold leading-6">Что писал</h2>
        <div className="mt-3">
          {messages.isLoading ? (
            <TaskSkeleton count={1} />
          ) : (messages.data ?? []).length === 0 ? (
            <p className="text-[14px] leading-[18px] text-muted">Пока ни одного сообщения в задачах</p>
          ) : (
            <ul className="space-y-2">
              {(messages.data ?? []).map((m) => (
                <li key={m.id} className="card-in">
                  <Link href={`/tasks/${m.task_id}`} className="block rounded-[12px] border border-border bg-surface px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2 text-[13px] leading-4 text-muted">
                      <span className="truncate">{m.task?.title ?? "Задача"}</span>
                      <span className="nums shrink-0">{humanAqtobe(new Date(m.created_at))}</span>
                    </div>
                    <p className="mt-1 text-[16px] leading-[22px]">
                      {m.type === "status_change"
                        ? `→ ${STATUS_LABEL[(m.meta as { new_status?: TaskStatus })?.new_status ?? "sent"] ?? "статус"}`
                        : m.type === "photo"
                          ? `📷 ${m.content ?? "фото к отчёту"}`
                          : m.content}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
