"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import { AnnouncementCard } from "@/components/ether/AnnouncementCard";
import { FlightTargetProvider } from "@/components/feed/FlightTarget";
import { TaskCard } from "@/components/tasks/TaskCard";
import { toast } from "@/components/ui/Toast";
import type { Announcement } from "@/lib/ether/queries";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import type { TaskStatus } from "@/lib/tasks/status-text";

/**
 * Component sandbox (D-167): the employee's presses answered by motion. «Принял» sends a copy of
 * the card into the face's hands, a report handed in sends one up, «Ознакомился» turns into its
 * mark. Nothing here touches the network: the actions change local state the way the optimistic
 * update would, and «сбой записи» takes it back a moment later, as a failed write does.
 */

const HOUR = 3600_000;

function task(id: string, status: TaskStatus, title: string, body: string | null, hours: number): TaskWithPeople {
  return {
    id,
    company_id: "company",
    author_id: "director",
    assignee_id: "me",
    parent_task_id: null,
    passed_to: null,
    group_id: null,
    title,
    body,
    deadline: new Date(Date.now() + hours * HOUR).toISOString(),
    priority: "normal",
    status,
    source: "voice",
    source_audio_path: null,
    source_transcript: null,
    scheduled_send_at: null,
    recurrence_rule_id: null,
    recurrence_on: null,
    accepted_at: null,
    completed_at: null,
    closed_at: null,
    created_at: new Date(Date.now() - 2 * HOUR).toISOString(),
    updated_at: new Date().toISOString(),
    assignee: { full_name: "Ерлан Бекетов" },
    author: { full_name: "Тимур Сапаров" },
  };
}

const START: TaskWithPeople[] = [
  task("t-sent", "sent", "Подготовить КП для Казхрома", "Смета и сроки, копия — в почту снабжения", 6),
  task("t-work", "accepted", "Сверить остатки на складе №2", null, 3),
  task("t-rework", "rework", "Переделать акт сверки за октябрь", "Не сходится строка по ГСМ", 26),
  task("t-sent-2", "sent", "Позвонить поставщику по графику поставок", null, 2),
];

const OUTSIDE: TaskWithPeople = task("t-outside", "sent", "Вне провайдера: принять без полёта", null, 5);

const ANNOUNCEMENT: Announcement = {
  id: "a1",
  company_id: "company",
  author_id: "director",
  audio_path: null,
  created_at: new Date(Date.now() - 40 * 60_000).toISOString(),
  transcript: "Всем: завтра в 9:00 планёрка в большом зале. Возьмите отчёты за неделю.",
  author: { full_name: "Тимур Сапаров" },
  acks: [{ user_id: "u1", created_at: new Date().toISOString(), user: { full_name: "Айгуль" } }],
};

const never = () => () => {};

export default function FlightSandbox() {
  // the fixtures read the clock: drawn on the client only, or the server's minute is not the client's
  const client = useSyncExternalStore(never, () => true, () => false);
  return client ? <Sandbox /> : null;
}

function Sandbox() {
  const [tasks, setTasks] = useState(START);
  const [outside, setOutside] = useState(OUTSIDE);
  const [ann, setAnn] = useState(ANNOUNCEMENT);
  const [fail, setFail] = useState(false);
  const [landed, setLanded] = useState(0);
  const face = useRef<HTMLDivElement>(null);

  const move = (id: string, status: TaskStatus) => {
    const was = [...tasks, outside].find((t) => t.id === id)?.status;
    const set = (to: TaskStatus) => setTasks((list) => list.map((t) => (t.id === id ? { ...t, status: to } : t)));
    const setOut = (to: TaskStatus) => setOutside((t) => (t.id === id ? { ...t, status: to } : t));
    // the optimistic update lands a moment after the tap, as the real one does
    queueMicrotask(() => {
      set(status);
      setOut(status);
    });
    if (fail && was) {
      setTimeout(() => {
        set(was);
        setOut(was);
        toast("Не получилось. Попробуй ещё раз");
      }, 900);
    }
  };

  const actions: TaskActions = {
    transition: ({ taskId, toStatus }) => move(taskId, toStatus),
    complete: ({ taskId }) => move(taskId, "pending_review"),
    revoke: () => {},
    sendNow: () => {},
    extend: () => {},
    reassign: () => {},
    sendMessage: () => {},
    remove: () => {},
    reissue: () => {},
    markRead: () => {},
    requestTime: () => {},
    answerTime: () => {},
    nudge: () => {},
    busy: false,
  };

  const getTarget = useCallback(() => face.current, []);
  const onLand = useCallback(() => {
    setLanded((n) => n + 1);
    face.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.07)" }, { transform: "scale(1)" }], { duration: 260, easing: "ease-out" });
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 pb-24 pt-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px]">
        <button
          type="button"
          className="text-accent underline"
          data-testid="flight-reset"
          onClick={() => {
            setTasks(START);
            setOutside(OUTSIDE);
            setAnn(ANNOUNCEMENT);
          }}
        >
          Сначала
        </button>
        <label className="flex items-center gap-1.5 text-muted">
          <input type="checkbox" checked={fail} onChange={(event) => setFail(event.target.checked)} data-testid="flight-fail" />
          сбой записи
        </label>
        <span className="nums text-muted" data-testid="flight-landed">
          в руках: {landed}
        </span>
      </div>

      <FlightTargetProvider getTarget={getTarget} onLand={onLand}>
        {/* a stand-in for the face: the flights only need its box */}
        <div className="flex justify-center py-6">
          <div
            ref={face}
            data-testid="flight-face"
            className="relative flex h-[132px] w-[132px] items-center justify-center rounded-full"
            style={{ background: "radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--accent) 70%, white), var(--accent) 60%, color-mix(in srgb, var(--accent) 60%, black))" }}
          >
            <span className="absolute left-[40px] top-[52px] h-3 w-3 rounded-full bg-bg" />
            <span className="absolute right-[40px] top-[52px] h-3 w-3 rounded-full bg-bg" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {tasks.map((t) => (
            <div key={t.id} className="card-in" data-testid={`flight-card-${t.id}`}>
              <TaskCard task={t} variant="employee" actions={actions} companyId="company" />
            </div>
          ))}
        </div>
      </FlightTargetProvider>

      <p className="mt-4 px-1 text-[13px] text-muted">Объявление (везде, не только в Ленте):</p>
      <AnnouncementCard
        item={ann}
        userId="me"
        isDirector={false}
        teamSize={12}
        acking={false}
        onAck={() =>
          queueMicrotask(() => {
            setAnn((a) => ({ ...a, acks: [...a.acks, { user_id: "me", created_at: new Date().toISOString(), user: null }] }));
            if (fail) setTimeout(() => setAnn((a) => ({ ...a, acks: a.acks.filter((x) => x.user_id !== "me") })), 900);
          })
        }
      />

      <p className="mt-4 px-1 text-[13px] text-muted">Вне провайдера — как в «Моих делах», без полёта:</p>
      <div data-testid="flight-outside">
        <TaskCard task={outside} variant="employee" actions={actions} companyId="company" />
      </div>
    </main>
  );
}
