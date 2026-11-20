/**
 * Taken-away sign-in smoke (D-135, second step), through the API of a running app, on a
 * temporary person who is removed at the end: added without an email → signed in on three
 * «phones» with codes → «на других устройствах» from phone A closes B, A stays → the director's
 * «Выйти со всех устройств» closes A → firing closes phone C and refuses a new code; an
 * employee cannot sign the director out. Touches nobody else's sessions. Requires the
 * migration 20261014180000 on the base and a running app on APP_URL (default :3000).
 */
import { apiSession, APP_URL, finish, record, recordError, serviceClient, sessionCookie } from "./lib/smoke";

const DIRECTOR = "10000000-0000-0000-0000-000000000001";

const bearer = async (email: string) => (await apiSession(email, "demo1234")).token;

async function call(path: string, auth: { token?: string; cookie?: string }, body?: unknown) {
  const res = await fetch(`${APP_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(auth.token ? { authorization: `Bearer ${auth.token}` } : {}),
      ...(auth.cookie ? { cookie: auth.cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** A fresh «phone»: a code from the director, typed into the sign-in screen. */
async function phone(director: string, id: string): Promise<string> {
  const issued = await call(`/api/people/${id}/login-code`, { token: director }, { client_request_id: crypto.randomUUID() });
  const res = await fetch(`${APP_URL}/api/auth/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: issued.body.code, client_request_id: crypto.randomUUID() }),
  });
  if (res.status !== 200) throw new Error(`code sign-in failed: ${res.status}`);
  return sessionCookie(res);
}

const me = async (cookie: string) => (await call("/api/me", { cookie })).status;

async function main() {
  const director = await bearer("director@demo.local");
  const service = serviceClient();

  const created = await call("/api/people", { token: director }, { full_name: `Смоук Сессий ${Date.now() % 10000}`, role: "employee" });
  const id = created.body.id as string | undefined;
  record("новый сотрудник без почты → 201", created.status === 201 && !!id, `status=${created.status}`);
  if (!id) throw new Error("no temp person");

  try {
    const a = await phone(director, id);
    const b = await phone(director, id);
    record("два телефона вошли по кодам", (await me(a)) === 200 && (await me(b)) === 200, "A и B");

    const others = await call(`/api/people/${id}/sessions`, { cookie: a }, { keep_current: true });
    record("A: «на других устройствах» → 200, закрыт 1", others.status === 200 && others.body.sessions === 1, JSON.stringify(others.body));
    record("B выкинут сразу (401)", (await me(b)) === 401, "B");
    record("A остался", (await me(a)) === 200, "A");

    const all = await call(`/api/people/${id}/sessions`, { token: director }, {});
    record("директор: «со всех устройств» → 200", all.status === 200, JSON.stringify(all.body));
    record("A выкинут сразу (401)", (await me(a)) === 401, "A");

    const aigul = await bearer("aigul@demo.local");
    const denied = await call(`/api/people/${DIRECTOR}/sessions`, { token: aigul }, {});
    record("сотрудник не закрывает вход директора → 403", denied.status === 403, `status=${denied.status}`);

    const c = await phone(director, id);
    const fired = await service.from("profiles").update({ is_active: false }).eq("id", id);
    record("увольнение записано", !fired.error, fired.error?.message ?? "ok");
    record("C после увольнения выкинут (401)", (await me(c)) === 401, "C");
    const again = await call(`/api/people/${id}/login-code`, { token: director }, { client_request_id: crypto.randomUUID() });
    record("уволенному код не выдаётся → 409", again.status === 409, `status=${again.status}`);
  } finally {
    const removed = await service.auth.admin.deleteUser(id);
    record("временный сотрудник удалён", !removed.error, removed.error?.message ?? "ok");
  }
}

main()
  .catch((error: unknown) => recordError("smoke", error))
  .finally(() => finish());
