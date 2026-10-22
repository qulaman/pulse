import type { BoardTask } from "@/lib/pulse/board";
import type { Rule } from "@/lib/recurrence/queries";
import type { TaskMessage, TaskWithPeople } from "@/lib/tasks/queries";
import type { TaskStatus } from "@/lib/tasks/status-text";

/** Fixtures of the task sandboxes (/dev/tasks, /dev/task): now-relative, every state there is. */
const HOUR = 3_600_000;
export const DIRECTOR = { id: "u-director", name: "Ерлан Сапаров" };
export const PEOPLE = {
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
  /** D-128: the employee asks for a deadline `hours` from now, with their words */
  timeRequest?: { hours: number; words?: string };
  /** D-128: the refusal names this colleague */
  suggest?: Who;
  /** D-128: handed in as «сделано не всё» */
  partial?: boolean;
  /** D-128: the director reminded, hours ago (negative) */
  nudged?: number;
  /** D-128: reassigned to this person */
  passedTo?: Who;
  /** D-148: made by this repeating order (RULES) */
  rule?: string;
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
  { title: "Акт сверки с «Актобе-Энерго»", who: "aigul", status: "pending_review", deadline: -20, created: -50, accepted: -48, completed: -3, rule: "rule-1" },
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
  { title: "Позвонить в «КазМунайГаз» по тендеру", who: "marat", status: "sent", deadline: -2, created: -6, nudged: -0.2 },
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
  // D-128: the life between «Принял» and «Принято»
  {
    title: "Смонтировать вентиляцию во втором цехе",
    who: "marat",
    status: "accepted",
    deadline: 3,
    created: -30,
    accepted: -29,
    timeRequest: { hours: 27, words: "жду поставку вентиляторов" },
  },
  {
    title: "Сверить остатки цемента на складе",
    who: "askhat",
    status: "declined",
    deadline: 20,
    declineReason: "Это не ко мне. Цемент ведёт Ерлан",
    suggest: "erlan",
    created: -6,
    closed: -1,
  },
  { title: "Вывезти строительный мусор с объекта", who: "aigul", status: "pending_review", deadline: 10, created: -26, accepted: -25, completed: -2, partial: true },
  { title: "Проверить пожарные датчики в офисе", who: "marat", status: "revoked", created: -30, closed: -3, passedTo: "erlan" },
  { title: "Согласовать график отпусков на октябрь", who: "askhat", status: "done", created: -300, accepted: -290, completed: -250, closed: -240 },
];

const at = (hours: number | null | undefined) =>
  hours === null || hours === undefined ? null : new Date(Date.now() + hours * HOUR).toISOString();

export function build(): { tasks: TaskWithPeople[]; board: BoardTask[] } {
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
      passed_to: f.passedTo ? `u-${f.passedTo}` : null,
      passed: f.passedTo ? { full_name: PEOPLE[f.passedTo] } : null,
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
      recurrence_rule_id: f.rule ?? null,
      recurrence_on: null,
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
        time_request: f.timeRequest
          ? { id: `${id}-t`, proposed: at(f.timeRequest.hours) as string, words: f.timeRequest.words ?? null, at: at(-0.5) as string, senderId: task.assignee_id }
          : null,
        suggestion: f.suggest ? { id: `u-${f.suggest}`, name: PEOPLE[f.suggest] } : null,
        nudged_at: at(f.nudged),
        partial: Boolean(f.partial),
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

/** A believable thread for a fixture task: the order's own history and a few words. */
export function messagesFor(task: TaskWithPeople, board: BoardTask | undefined): TaskMessage[] {
  const rows: TaskMessage[] = [];
  let seq = 0;
  const push = (type: string, content: string | null, senderId: string, at: string, meta: Record<string, unknown> = {}) => {
    seq += 1;
    rows.push({
      id: `${task.id}-m${seq}`,
      task_id: task.id,
      company_id: "company",
      sender_id: senderId,
      type,
      content,
      file_path: null,
      meta,
      seq,
      created_at: at,
      sender: { full_name: senderId === DIRECTOR.id ? DIRECTOR.name : (task.assignee?.full_name ?? "") },
    } as unknown as TaskMessage);
  };
  push("status_change", null, DIRECTOR.id, task.created_at, { new_status: "sent" });
  if (task.accepted_at) push("status_change", null, task.assignee_id, task.accepted_at, { new_status: "accepted" });
  if (board?.last_message) {
    push("text", board.last_message.content, board.last_message.sender_id, board.last_message.created_at);
  }
  if (board?.question) push("text", board.question, task.assignee_id, board.question_at ?? task.created_at, { is_question: true });
  if (task.completed_at) {
    const partial = board?.partial ? { partial: true } : {};
    push("text", board?.partial ? "Вывез две машины из трёх — третью закажу на понедельник" : "Сделал, всё в файле. Проверьте, пожалуйста", task.assignee_id, task.completed_at, { report: true, ...partial });
    push("status_change", null, task.assignee_id, task.completed_at, { new_status: "pending_review" });
  }
  if (board?.decline_reason) {
    const suggestion = board.suggestion ? { suggest_assignee_id: board.suggestion.id, suggest_name: board.suggestion.name } : {};
    push("text", board.decline_reason, task.assignee_id, task.closed_at ?? task.created_at, { decline_reason: true, ...suggestion });
  }
  if (board?.time_request) {
    const request = board.time_request;
    push("text", `Прошу срок до ${request.proposed.slice(8, 10)}.${request.proposed.slice(5, 7)}${request.words ? ` · ${request.words}` : ""}`, task.assignee_id, request.at, {
      time_request: true,
      proposed_deadline: request.proposed,
      words: request.words,
    });
  }
  if (board?.nudged_at) push("system", "Директор напомнил", DIRECTOR.id, board.nudged_at, { nudge: true });
  if (task.passed_to) {
    push("status_change", null, DIRECTOR.id, task.closed_at ?? task.created_at, { new_status: "revoked" });
    push("system", `Передана: ${task.passed?.full_name ?? ""}`, DIRECTOR.id, task.closed_at ?? task.created_at, { reassigned_to: "fx-new", assignee_id: task.passed_to });
  }
  return rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).map((row, index) => ({ ...row, seq: index + 1 }));
}

const ymdIn = (days: number) => new Date(Date.now() + days * 86_400_000 + 5 * HOUR).toISOString().slice(0, 10);

/** D-148: the company's repeating orders and a meeting series, as «Повторы» shows them. */
export function rules(): Rule[] {
  const base = {
    company_id: "company",
    author_id: DIRECTOR.id,
    body: null,
    priority: "normal" as const,
    rrule: null,
    interval_n: 1,
    month_day: 0,
    weekdays: [] as number[],
    duration_min: null,
    location: null,
    remind_before_min: 30,
    everyone: false,
    participant_ids: [] as string[],
    source_audio_path: null,
    source_transcript: null,
    anchor_on: ymdIn(-14),
    last_on: ymdIn(-7),
    next_run_at: null,
    stopped_reason: null,
    created_at: at(-400) as string,
    updated_at: at(-2) as string,
  };
  return [
    { ...base, id: "rule-1", target: "task", title: "Акт сверки с «Актобе-Энерго»", assignee_id: "u-aigul", assignee: { full_name: PEOPLE.aigul }, every: "week", weekdays: [1], at_time: "18:00:00", is_active: true, next_on: ymdIn(4) },
    { ...base, id: "rule-2", target: "task", title: "Сводка продаж за день", assignee_id: "u-marat", assignee: { full_name: PEOPLE.marat }, every: "workday", at_time: "09:00:00", is_active: true, next_on: ymdIn(1) },
    { ...base, id: "rule-3", target: "task", title: "Отчёт по зарплате", assignee_id: "u-dana", assignee: { full_name: PEOPLE.dana }, every: "month", month_day: 5, at_time: "18:00:00", is_active: false, next_on: null },
    { ...base, id: "rule-4", target: "task", title: "Проверка склада", assignee_id: "u-erlan", assignee: { full_name: PEOPLE.erlan }, every: "week", weekdays: [2, 4], interval_n: 2, at_time: "10:00:00", is_active: false, stopped_reason: "assignee_inactive", next_on: null },
    { ...base, id: "rule-5", target: "event", title: "Планёрка", assignee_id: null, assignee: null, every: "week", weekdays: [3], at_time: "10:00:00", location: "в офисе", everyone: true, is_active: true, next_on: ymdIn(6) },
  ];
}

