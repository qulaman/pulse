/**
 * The launch of a company on «Сегодня» (И-77): a new company sees what to do next instead of an
 * empty «Всё закрыто». Pure: every step is counted from data the company already has, nothing is
 * ticked by hand, and the list goes by itself with the first task sent.
 */

/** What says a company has been at work. `sentTasks` — tasks that have ever left a director's hands. */
export type CompanyHistory = { sentTasks: number; announcements: number };

/**
 * A company nobody has worked in yet. Not known — not new: a read that failed or has not come
 * must never put a checklist in front of a company with a history.
 */
export function isNewCompany(history: CompanyHistory | null | undefined): boolean {
  return history != null && history.sentTasks === 0 && history.announcements === 0;
}

/** The tasks at hand already answer it: one sent is a history, one only scheduled has gone nowhere. */
export function tasksShowHistory(tasks: readonly { status: string }[]): boolean {
  return tasks.some((task) => task.status !== "scheduled");
}

export type LoginCode = "none" | "open" | "used" | "expired" | "cancelled";

/** What the server knows of a person's way in; `email` — a real one, a service address is none. */
export type LoginFact = { signedInAt: string | null; email: string | null; code: LoginCode };

/** Has a way in: has entered, has a password login, or holds a live or used code. A code that burned is nothing. */
export function hasLogin(fact: LoginFact): boolean {
  return Boolean(fact.signedInAt) || Boolean(fact.email) || fact.code === "open" || fact.code === "used";
}

/** The people after `currentId` in order, then those before it: the walk goes on from the card it stands on. */
export function nextInTurn<T extends { id: string }>(people: readonly T[], currentId: string): T[] {
  const at = people.findIndex((person) => person.id === currentId);
  return at < 0 ? [...people] : [...people.slice(at + 1), ...people.slice(0, at)];
}

export type LaunchFacts = {
  companyName: string | null;
  hasLogo: boolean;
  /** Working people, without the director and the wall. */
  team: number;
  /** Somebody of the team has a way in. */
  anyLogin: boolean;
  /** The first of the team without one: the step leads to that card. */
  nextPersonId: string | null;
  /** A first name for the example of the first order; null — the team is empty. */
  firstName: string | null;
};

export type LaunchStepKey = "brand" | "people" | "login" | "order";

export type LaunchStep = {
  key: LaunchStepKey;
  title: string;
  hint: string;
  done: boolean;
  /** Where the step leads: an address, or `null` — the caret goes to the order line. No `action` — not yet. */
  action?: { label: string; href: string | null };
};

const people = (count: number) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "человек";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "человека";
  return "человек";
};

/** The four steps, in the order a company takes them. The last one is what ends the list. */
export function launchSteps(facts: LaunchFacts): LaunchStep[] {
  const named = Boolean(facts.companyName?.trim());
  const staffed = facts.team > 0;
  return [
    {
      key: "brand",
      title: "Логотип и название",
      done: named && facts.hasLogo,
      hint: named && facts.hasLogo ? (facts.companyName ?? "").trim() : "Их видит команда в приложении и на экране в офисе",
      action: { label: named && facts.hasLogo ? "Изменить" : "Настроить", href: "/desk/settings" },
    },
    {
      key: "people",
      title: "Люди добавлены",
      done: staffed,
      hint: staffed ? `${facts.team} ${people(facts.team)} в команде` : "По одному или сразу списком из Excel",
      action: { label: staffed ? "Добавить ещё" : "Добавить", href: "/desk/team/new" },
    },
    {
      key: "login",
      title: "Вход выдан",
      done: facts.anyLogin,
      hint: !staffed ? "Появится, когда будут люди" : facts.anyLogin ? "Остальным — так же, с их карточек" : "Код на 15 минут: человек вводит его на телефоне",
      action: !staffed ? undefined : { label: facts.anyLogin ? "Следующему" : "Выдать код", href: facts.nextPersonId ? `/desk/team/${facts.nextPersonId}` : "/desk/team" },
    },
    {
      key: "order",
      title: "Первое поручение",
      done: false,
      hint: `Строкой сверху, словами: «${facts.firstName ?? "Марат"}, проверь договор до пятницы»`,
      action: { label: "Написать", href: null },
    },
  ];
}

/** The step to take now: the first one not done that has somewhere to lead. */
export function nextStep(steps: readonly LaunchStep[]): LaunchStep | null {
  return steps.find((step) => !step.done && step.action) ?? null;
}

const HIDDEN_KEY = "desk.launch.hidden";

/** «Скрыть» is this browser's and this company's: another company on the same computer still sees its own. */
export function launchHiddenKey(companyId: string): string {
  return `${HIDDEN_KEY}.${companyId}`;
}
