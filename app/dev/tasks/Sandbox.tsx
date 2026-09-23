"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DirectorTasksView } from "@/components/tasks/list/DirectorTasksView";
import { EmployeeTasksView } from "@/components/tasks/list/EmployeeTasksView";
import type { BoardTask } from "@/lib/pulse/board";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import type { TaskStatus } from "@/lib/tasks/status-text";

const HOUR = 3_600_000;
const DIRECTOR = { id: "u-director", name: "Ерлан Сапаров" };
const PEOPLE = {
  marat: "Марат Оспанов",
  askhat: "Асхат Нурланов",
  aigul: "Айгуль Сейтказиева",
  erlan: "Ерлан Бекмуханов",
  dana: "Дана Жумабаева",
} as const;
type Who = keyof typeof PEOPLE;

type Fixture = {
  title: string;
  who: Who;
  status: TaskStatus;
  /** Hours from now; negative — in the past. */
  deadline?: number | null;
  body?: string;
  priority?: "high" | "normal";
  question?: string;
  declineReason?: string;
  last?: { from: "director" | "employee"; text: string; hoursAgo: number; unread?: boolean };
  created?: number;
  accepted?: number;
  completed?: number;
  closed?: number;
  scheduled?: number;
  audio?: boolean;
};

/** Now-relative, so the sandbox always has something overdue, due today and due tomorrow. */
const FIXTURES: Fixture[] = [
  {
    title: "КП для Казхрома со сметой и сроками поставки",
    who: "marat",
    status: "pending_review",
    deadline: 5,
    body: "Смета и сроки, копия — в почту снабжения. Цены на сентябрь.",
    created: -26,
    accepted: -25,
    completed: -1,
    last: { from: "employee", text: "Готово, файл в треде. Цены проверил с Айгуль", hoursAgo: 1, unread: true },
    audio: true,
  },
  { title: "Акт сверки с «Актобе-Энерго»", who: "aigul", status: "pending_review", deadline: -20, created: -50, accepted: -48, completed: -3 },
  {
    title: "Забрать арматуру со склада на Жубанова",
    who: "erlan",
    status: "accepted",
    deadline: 22,
    question: "Брать 12-ю или 14-ю? На складе есть обе",
    created: -5,
    accepted: -4,
  },
  { title: "Съездить в акимат за разрешением на земляные работы", who: "askhat", status: "declined", deadline: 30, declineReason: "Занят срочным", created: -8, closed: -2 },
  { title: "Отчёт по дебиторке за август", who: "dana", status: "accepted", deadline: -19, created: -72, accepted: -70 },
  { title: "Позвонить в «КазМунайГаз» по тендеру", who: "marat", status: "sent", deadline: -2, created: -6 },
  { title: "Заказать пропуска на объект для новой бригады", who: "askhat", status: "sent", deadline: 24, created: -0.5 },
  {
    title: "Проверить бетон на объекте «Нурсая» — лабораторные образцы",
    who: "erlan",
    status: "accepted",
    deadline: 70,
    created: -20,
    accepted: -19,
    last: { from: "director", text: "Результаты лаборатории — фото в тред", hoursAgo: 18 },
  },
  {
    title: "Фотоотчёт по кровле",
    who: "aigul",
    status: "rework",
    deadline: 7,
    created: -30,
    accepted: -29,
    completed: -6,
    last: { from: "director", text: "Добавь фото с северной стороны, там протечка", hoursAgo: 4 },
  },
  { title: "Отправить договор юристу на согласование", who: "dana", status: "accepted", deadline: null, priority: "high", created: -1, accepted: -0.8 },
  { title: "Собрать заявки на спецодежду до конца месяца", who: "marat", status: "accepted", deadline: null, created: -40, accepted: -39 },
  { title: "Напомнить бригадирам про планёрку", who: "askhat", status: "scheduled", deadline: 90, scheduled: 64, created: -1 },
  { title: "Оплатить счёт за электроэнергию", who: "aigul", status: "done", created: -28, accepted: -27, completed: -5, closed: -2 },
  { title: "Разместить вакансию прораба на hh.kz", who: "dana", status: "done", created: -60, accepted: -58, completed: -30, closed: -26 },
  { title: "В субботу сходить на страйкбол", who: "marat", status: "revoked", created: -50, closed: -24 },
  { title: "Согласовать график отпусков на октябрь", who: "askhat", status: "done", created: -300, accepted: -290, completed: -250, closed: -240 },
];

const at = (hours: number | null | undefined) =>
  hours === null || hours === undefined ? null : new Date(Date.now() + hours * HOUR).toISOString();

function build(): { tasks: TaskWithPeople[]; board: BoardTask[] } {
  const tasks: TaskWithPeople[] = [];
  const board: BoardTask[] = [];
  FIXTURES.forEach((f, index) => {
    const id = `fx-${index + 1}`;
    const task: TaskWithPeople = {
      id,
      company_id: "company",
      author_id: DIRECTOR.id,
      assignee_id: `u-${f.who}`,
      parent_task_id: null,
      group_id: null,
      title: f.title,
      body: f.body ?? null,
      deadline: at(f.deadline),
      priority: f.priority ?? "normal",
      status: f.status,
      source: "voice",
      source_audio_path: f.audio ? "company/director/fixture.webm" : null,
      source_transcript: f.audio ? `${PEOPLE[f.who].split(" ")[0]}, ${f.title.toLowerCase()} к вечеру` : null,
      scheduled_send_at: at(f.scheduled),
      recurrence_rule_id: null,
      accepted_at: at(f.accepted),
      completed_at: at(f.completed),
      closed_at: at(f.closed),
      created_at: at(f.created ?? -2) as string,
      updated_at: at(f.closed ?? f.completed ?? f.accepted ?? f.created ?? -2) as string,
      assignee: { full_name: PEOPLE[f.who] },
      author: { full_name: DIRECTOR.name },
    };
    tasks.push(task);
    const onBoard = ["sent", "accepted", "in_progress", "rework", "pending_review", "declined"].includes(f.status);
    if (onBoard) {
      board.push({
        ...task,
        question: f.question ?? null,
        question_id: f.question ? `${id}-q` : null,
        question_at: f.question ? at(-0.3) : null,
        decline_reason: f.declineReason ?? null,
        last_message: f.last
          ? {
              id: `${id}-m`,
              content: f.last.text,
              type: "text",
              sender_id: f.last.from === "director" ? DIRECTOR.id : task.assignee_id,
              seq: 10,
              created_at: at(-f.last.hoursAgo) as string,
            }
          : null,
        seen_seq: f.last && !f.last.unread ? 10 : 0,
      });
    }
  });
  return { tasks, board };
}

/**
 * The real «Задачи» and «Мои дела» views on fixtures. The actions change the fixtures in
 * memory — cards leave their tab, the next one opens, toasts speak — and nothing reaches
 * the network or anybody's phone.
 */
export function Sandbox({ role, empty }: { role: "director" | "employee"; empty: boolean }) {
  const initial = useMemo(() => (empty ? { tasks: [], board: [] } : build()), [empty]);
  const [tasks, setTasks] = useState<TaskWithPeople[]>(initial.tasks);
  const [board, setBoard] = useState<BoardTask[]>(initial.board);
  const now = useMemo(() => new Date(), []);

  const patch = (taskId: string, change: Partial<TaskWithPeople>) => {
    setTasks((list) => list.map((task) => (task.id === taskId ? { ...task, ...change, updated_at: new Date().toISOString() } : task)));
    setBoard((list) => list.map((row) => (row.id === taskId ? { ...row, ...change } : row)));
  };
  const stamp = new Date().toISOString();

  const actions: TaskActions = {
    transition: ({ taskId, toStatus }) => {
      const extra: Partial<TaskWithPeople> =
        toStatus === "accepted"
          ? { accepted_at: stamp }
          : toStatus === "pending_review"
            ? { completed_at: stamp }
            : toStatus === "done" || toStatus === "declined"
              ? { closed_at: stamp }
              : {};
      patch(taskId, { status: toStatus, ...extra });
    },
    complete: ({ taskId }) => patch(taskId, { status: "pending_review", completed_at: stamp }),
    revoke: (taskId) => patch(taskId, { status: "revoked", closed_at: stamp }),
    extend: ({ taskId, deadlineIso }) => patch(taskId, { deadline: deadlineIso }),
    reassign: ({ taskId, assigneeName }) => patch(taskId, { assignee: { full_name: assigneeName } }),
    sendMessage: ({ taskId }) => setBoard((list) => list.map((row) => (row.id === taskId ? { ...row, question: null } : row))),
    remove: (taskId) => {
      setTasks((list) => list.filter((task) => task.id !== taskId));
      setBoard((list) => list.filter((row) => row.id !== taskId));
    },
    markRead: () => {},
    busy: false,
  };

  const mine = tasks.filter((task) => task.assignee_id === "u-marat");

  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border/80 bg-bg px-4 py-2">
        <div className="mx-auto flex max-w-lg items-center gap-2 text-[13px]">
          <span className="font-display font-bold text-accent">/dev/tasks</span>
          <Link className={role === "director" ? "text-text" : "text-muted"} href="/dev/tasks?role=director">
            Директор
          </Link>
          <Link className={role === "employee" ? "text-text" : "text-muted"} href="/dev/tasks?role=employee">
            Сотрудник
          </Link>
          <Link className={empty ? "text-text" : "text-muted"} href={`/dev/tasks?role=${role}${empty ? "" : "&empty=1"}`}>
            Пусто
          </Link>
        </div>
      </header>
      {role === "director" ? (
        <DirectorTasksView
          meId={DIRECTOR.id}
          companyId="company"
          tasks={tasks}
          board={board}
          actions={actions}
          now={now}
          onPurge={(done) => {
            setTasks((list) => list.filter((task) => !["done", "revoked", "declined"].includes(task.status)));
            done();
          }}
        />
      ) : (
        <EmployeeTasksView
          meId="u-marat"
          companyId="company"
          tasks={mine}
          board={board.filter((row) => row.assignee_id === "u-marat")}
          actions={actions}
          now={now}
        />
      )}
    </div>
  );
}
