import type { AuditRow } from "@/lib/ops/contract";
import { STATUS_LABEL, type TaskStatus } from "@/lib/tasks/status-text";

/** The journal in words: what the base keeps by code, as the operator reads it. */

export const ACTION_LABEL: Record<string, string> = {
  create_company: "Новая компания",
  update_company: "Правка компании",
  add_person: "Новый человек",
  update_person: "Правка человека",
  issue_login_code: "Код входа",
  revoke_sessions: "Закрыты входы",
  change_director: "Смена директора",
  adjust_points: "Поправка очков",
  task_lookup: "Просмотр задачи",
  update_task: "Правка задачи",
  delete_task: "Удаление задачи",
  wipe_activity: "Очистка данных",
  export_company: "Выгрузка",
  purge_company: "Удаление компании",
  grant_operator: "Доступ выдан",
  revoke_operator: "Доступ отозван",
};

export const actionText = (action: string): string => ACTION_LABEL[action] ?? action;

export const DANGEROUS = new Set(["wipe_activity", "purge_company", "delete_task", "change_director"]);

/** Nobody signed in: a server command. An id without an address: a developer whose account is gone. */
export function whoText(row: Pick<AuditRow, "operator_id" | "operator_email">): string {
  if (row.operator_email) return row.operator_email;
  return row.operator_id ? `Удалённый разработчик ${row.operator_id.slice(0, 8)}` : "Команда на сервере";
}

const FIELD_TEXT: Record<string, string> = {
  full_name: "имя",
  position: "должность",
  role: "роль",
  is_active: "работает",
  title: "заголовок",
  body: "текст",
  deadline: "срок",
  parser: "модель разбора",
  points_enabled: "очки",
  lab_for_all: "лаборатория для всех",
  dev_tools: "инструменты разработчиков",
};

const FATE_TEXT: Record<string, string> = {
  deactivate: "ушёл из компании",
  demote: "остался сотрудником",
  keep: "пока остался директором",
};

const ROLE_TEXT: Record<string, string> = {
  manager: "руководитель",
  employee: "сотрудник",
  shopkeeper: "завхоз магазина",
  secretary: "секретарь",
};

/** One line of what an action touched; `person` and `task` are ids the screen turns into a name and a link. */
export type AuditFact = { label: string; value?: string; person?: string; task?: string };

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const count = (value: unknown): number | null => (Array.isArray(value) ? value.length : typeof value === "number" ? value : null);

function sum(rows: unknown): number | null {
  if (!rows || typeof rows !== "object") return null;
  return Object.values(rows as Record<string, number>).reduce((total, value) => total + (typeof value === "number" ? value : 0), 0);
}

/** What an action touched, read from what the journal kept. Anything unknown stays in «Как записано». */
export function auditFacts(row: AuditRow): AuditFact[] {
  const target = row.target ?? {};
  const result = row.result ?? {};
  const facts: AuditFact[] = [];
  const push = (label: string, value: string | number | null) => {
    if (value !== null && value !== 0) facts.push({ label, value: String(value) });
  };

  if (row.action === "change_director") {
    const was = text(target.old_id);
    const now = text(result.new_id) ?? text(target.new_id);
    if (was) facts.push({ label: "Был директором", person: was });
    if (now) facts.push({ label: "Стал директором", person: now });
    push("Прежний директор", FATE_TEXT[text(target.old_fate) ?? ""] ?? null);
    push("Перешло задач", count(result.tasks));
    push("Перешло повторов", count(result.rules));
    push("Перешло встреч", count(result.events));
    push("Перешло подчинённых", count(result.team));
    push("Отменено заявок", count(result.errands));
    return facts;
  }

  const person = text(target.user_id) ?? text(result.user_id);
  if (person) facts.push({ label: "Человек", person });
  const task = text(target.task_id) ?? text(result.task_id);
  if (task) facts.push({ label: "Задача", task });

  if (typeof target.amount === "number") push("Очки", target.amount > 0 ? `+${target.amount}` : target.amount);
  if (typeof result.balance === "number") facts.push({ label: "Баланс стал", value: String(result.balance) });
  if (Array.isArray(target.fields) && target.fields.length > 0) {
    facts.push({ label: "Что изменили", value: (target.fields as string[]).map((field) => FIELD_TEXT[field] ?? field).join(", ") });
  }
  if (Array.isArray(result.settings) && result.settings.length > 0) {
    facts.push({ label: "Настройки", value: (result.settings as string[]).map((field) => FIELD_TEXT[field] ?? field).join(", ") });
  }
  push("Название", text(target.name));
  push("Адрес", text(target.slug));
  push("Модель разбора", text(target.parser));
  push("Роль", ROLE_TEXT[text(target.role) ?? ""] ?? null);
  if (text(result.status)) push("Статус", STATUS_LABEL[result.status as TaskStatus] ?? text(result.status));
  push("Закрыто входов", typeof result.sessions === "number" ? result.sessions : null);
  push("Устройств", typeof result.devices === "number" ? result.devices : null);
  push("Строк стёрто", sum(result.rows));
  push("Файлов к снятию", typeof result.files_queued === "number" ? result.files_queued : null);
  push("Таблиц в выгрузке", count(result.tables));
  return facts;
}

/** Everything a search may hit: the words shown, the reason, and the ids kept in the row. */
export function auditHaystack(row: AuditRow): string {
  return [actionText(row.action), whoText(row), row.company_name, row.reason, row.company_id, JSON.stringify(row.target), JSON.stringify(row.result)].join(" ").toLowerCase();
}
