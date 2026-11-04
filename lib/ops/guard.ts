/**
 * The console's plain rules (D-157, tasks/029): the host and Origin checks and the map from a
 * base error to an answer. Free of `server-only` and of the contract: the proxy reads it on every
 * deployment that set OPS_HOST, and the tests run it without a Next runtime.
 */

/** The headers of every console answer (tasks/029 §7). */
export const OPS_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Robots-Tag": "noindex",
  "Cache-Control": "no-store",
};

/** Lower case, the first of a forwarded list. */
function cleanHost(host: string | null | undefined): string | null {
  const first = host?.split(",")[0]?.trim().toLowerCase();
  return first || null;
}

/** The host the browser asked for: the platform's forwarded one, otherwise `Host`. */
export function requestHost(headers: Headers): string | null {
  return cleanHost(headers.get("x-forwarded-host")) ?? cleanHost(headers.get("host"));
}

/** Without a port on the configured side any port matches: `next dev` sits on 3000. */
function sameHost(configured: string, host: string | null): boolean {
  if (!host) return false;
  const wanted = configured.trim().toLowerCase();
  return wanted.includes(":") ? host === wanted : host.split(":")[0] === wanted;
}

/** The request came to the console's own address; false on every deployment without OPS_HOST. */
export function isOpsHost(opsHost: string | undefined, host: string | null): boolean {
  return Boolean(opsHost) && sameHost(opsHost as string, host);
}

/** Without OPS_HOST the console answers on any host; with it, on that one only. */
export function hostAllowed(opsHost: string | undefined, host: string | null): boolean {
  return !opsHost || sameHost(opsHost, host);
}

/** A write must name its Origin and it must be this host: a missing one is refused too. */
export function originAllowed(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

/**
 * What a journal line keeps about a change: the field names, never the values. The journal outlives
 * a deleted company, and a task's text or a person's name must not (D-157).
 */
export function changedFields(patch: Record<string, unknown>): string[] {
  return Object.keys(patch).filter((key) => patch[key] !== undefined);
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Any 8-4-4-4-12 hex, like `z.guid()`: seed ids are not RFC-4122. */
export function isGuid(value: string): boolean {
  return GUID.test(value);
}

/** A failure of a base call, kept as the base said it: `message` is the raised code. */
export class OpsRpcError extends Error {
  readonly sqlstate: string | null;

  constructor(message: string, sqlstate: string | null = null) {
    super(message);
    this.name = "OpsRpcError";
    this.sqlstate = sqlstate;
  }
}

export type OpsFailure = { status: number; code: string; message_ru: string };

const FAILURES: Record<string, OpsFailure> = {
  ops_denied: { status: 401, code: "unauthorized", message_ru: "Войди в консоль заново" },
  ops_fresh_required: { status: 428, code: "fresh_required", message_ru: "Нужен код из приложения" },
  ops_bad_ticket: { status: 409, code: "bad_ticket", message_ru: "Подтверждение устарело, повтори действие" },
  reason_required: { status: 400, code: "validation_error", message_ru: "Напиши причину, хотя бы пять символов" },
  bad_table: { status: 400, code: "validation_error", message_ru: "Такой таблицы нет в выгрузке" },
  export_expired: { status: 409, code: "export_expired", message_ru: "Выгрузка устарела, начни заново" },
  confirm_mismatch: { status: 400, code: "confirm_mismatch", message_ru: "Название компании не совпало" },
  export_required: { status: 409, code: "export_required", message_ru: "Сначала выгрузи компанию: выгрузка действует сутки" },
  not_found: { status: 404, code: "not_found", message_ru: "Не найдено" },
  not_director: { status: 409, code: "not_director", message_ru: "Этот человек сейчас не директор компании" },
  use_change_director: { status: 409, code: "use_change_director", message_ru: "Директора меняет отдельное действие: «Директор»" },
  slug_taken: { status: 409, code: "slug_taken", message_ru: "Такой адрес уже занят" },
  email_exists: { status: 409, code: "email_exists", message_ru: "Такая почта уже зарегистрирована" },
  already_director: { status: 409, code: "already_director", message_ru: "Этот человек уже директор компании" },
  parser_rules_forbidden: { status: 400, code: "validation_error", message_ru: "Правила разбора меняются только в «Лаб → Парсер»" },
  bad_patch: { status: 400, code: "validation_error", message_ru: "Неверный запрос" },
  bad_role: { status: 400, code: "validation_error", message_ru: "Такой роли через консоль не выдать" },
  bad_fate: { status: 400, code: "validation_error", message_ru: "Неверный запрос" },
  invalid_name: { status: 400, code: "validation_error", message_ru: "Проверь название или имя" },
  purge_incomplete: { status: 500, code: "purge_incomplete", message_ru: "Удаление не сошлось и откатилось: компания на месте" },
  // issue_login_code
  duplicate: { status: 409, code: "duplicate", message_ru: "Код уже выдан — новый требует нового запроса" },
  inactive: { status: 409, code: "inactive", message_ru: "Человек отключён — сначала включи его" },
  too_many_codes: { status: 429, code: "too_many_codes", message_ru: "В компании слишком много невведённых кодов — новые через 15 минут" },
  // our own
  auth_failed: { status: 502, code: "auth_failed", message_ru: "Не удалось создать вход, попробуй ещё раз" },
  issue_failed: { status: 502, code: "issue_failed", message_ru: "Не получилось выдать код — можно ещё раз" },
};

const DENIED = FAILURES.ops_denied;
const INTERNAL: OpsFailure = { status: 500, code: "internal", message_ru: "Что-то пошло не так, попробуй ещё раз" };

/** PostgREST's own codes for a missing or dead JWT: an anon has no grant on any `ops_*`. */
const DENIED_SQLSTATES = new Set(["42501", "PGRST301", "PGRST302", "PGRST303"]);

/** The answer to a base error. The message goes first: a raised code wins over its sqlstate. */
export function opsFailure(message: string, sqlstate: string | null = null): OpsFailure {
  const known = Object.hasOwn(FAILURES, message) ? FAILURES[message] : undefined;
  if (known) return known;
  if (sqlstate === "23505" && message.includes("slug")) return FAILURES.slug_taken;
  if (sqlstate && DENIED_SQLSTATES.has(sqlstate)) return DENIED;
  return INTERNAL;
}
