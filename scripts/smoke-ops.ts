/**
 * Developers' console smoke (D-157, tasks/029), through the API of a running app on the dev base:
 * a throw-away operator signs in with a real TOTP, creates a throw-away company, runs every
 * write on it, wipes it, exports it, deletes it, and checks that the pilot did not move.
 * Requires the migration 20261104130000 on the base and a running app on APP_URL
 * (default http://localhost:3000). Refuses anything but the dev project. The journal keeps the
 * run's lines: it is append-only.
 *   pnpm smoke:ops
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

const DEV_REF = "qobsbjugromdwfdodwwa";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? "";

if (!SUPABASE_URL.includes(DEV_REF)) {
  console.error(`refusing: NEXT_PUBLIC_SUPABASE_URL is not the dev project (${DEV_REF})`);
  process.exit(1);
}

const stamp = Date.now().toString(36);
const OPERATOR_EMAIL = `smoke-ops-${stamp}@demo.local`;
const STRANGER_EMAIL = `smoke-stranger-${stamp}@demo.local`;
const PASSWORD = randomBytes(24).toString("base64url");
const SECRET_TITLE = `Секретная задача смоука ${stamp}`;
const COMPANY_NAME = `Смоук консоли ${stamp}`;
const SLUG = `ops-smoke-${stamp}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the ops_* RPCs reach lib/supabase/types.ts after db:types
const service = createClient<any>(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const checks: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail = ""): void {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${detail ? `  — ${detail}` : ""}`);
}

/** A browser's cookies, without a browser. */
class Jar {
  readonly cookies = new Map<string, string>();
  raw: string[] = [];

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  take(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      this.raw.push(line);
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      const value = pair.slice(at + 1);
      if (value === "" || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

type Answer = { status: number; body: Record<string, unknown> };

async function call(jar: Jar, path: string, init: { method?: string; body?: unknown; origin?: string | null } = {}): Promise<Answer> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const origin = init.origin === undefined ? APP_URL : init.origin;
  const response = await fetch(`${APP_URL}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(method !== "GET" && origin ? { origin } : {}),
      ...(jar.cookies.size ? { cookie: jar.header() } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  jar.take(response);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body };
}

const code = (answer: Answer) => (answer.body.error as { code?: string } | undefined)?.code;
const why = () => ({ reason: "живая проверка консоли", client_request_id: crypto.randomUUID() });

function base32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let at = 0; at + 8 <= bits.length; at += 8) bytes.push(parseInt(bits.slice(at, at + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** The next 30-second window: a code is good once per window. */
async function nextWindow(): Promise<void> {
  await new Promise((done) => setTimeout(done, 30_000 - (Date.now() % 30_000) + 500));
}

async function sql(query: string): Promise<{ status: number; text: string }> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return { status: response.status, text: await response.text() };
}

async function count(table: string, column: string, value: string): Promise<number> {
  const { count: found, error } = await service.from(table).select("*", { count: "exact", head: true }).eq(column, value);
  if (error) throw new Error(`${table}: ${error.message}`);
  return found ?? 0;
}

async function pilotCounts(id: string): Promise<string> {
  const tables = ["profiles", "tasks", "task_messages", "point_transactions", "notes", "ai_logs", "shop_items"];
  return (await Promise.all(tables.map((table) => count(table, "company_id", id)))).join("/");
}

async function drain(jar: Jar): Promise<number> {
  for (let round = 0; round < 10; round++) {
    const answer = await call(jar, "/api/ops/storage/drain", { method: "POST" });
    if (answer.status !== 200) throw new Error(`drain ${answer.status}`);
    if (answer.body.left === 0) return 0;
  }
  return -1;
}

async function seedFile(bucket: string, company: string, user: string): Promise<string> {
  const path = `${company}/${user}/${crypto.randomUUID()}.webm`;
  const { error } = await service.storage.from(bucket).upload(path, new Blob([randomBytes(64)], { type: "audio/webm" }));
  if (error) throw new Error(`upload ${bucket}: ${error.message}`);
  return path;
}

async function seedActivity(company: string, author: string, assignee: string, title: string) {
  const task = await service.from("tasks").insert({ company_id: company, author_id: author, assignee_id: assignee, title, status: "sent" }).select("id").single();
  if (task.error) throw new Error(`task: ${task.error.message}`);
  const message = await service.from("task_messages").insert({ company_id: company, task_id: task.data.id, sender_id: author, type: "text", content: "сообщение смоука" });
  if (message.error) throw new Error(`message: ${message.error.message}`);
  const note = await service.from("notes").insert({ company_id: company, user_id: author, text: "заметка смоука" });
  if (note.error) throw new Error(`note: ${note.error.message}`);
  return task.data.id as string;
}

/** A run that broke off leaves its company: the console removes it the way it removes any. */
async function removeCompany(jar: Jar, id: string, name: string): Promise<boolean> {
  const started = await call(jar, `/api/ops/companies/${id}/export`, { body: why() });
  const exportId = started.body.export_id as string | undefined;
  if (!exportId) return false;
  const sha256 = createHash("sha256").update(id).digest("hex");
  await call(jar, `/api/ops/exports/${exportId}/finish`, { body: { sha256, counts: {} } });
  const purged = await call(jar, `/api/ops/companies/${id}/purge`, { body: { confirm_name: name, ...why() } });
  if (purged.status !== 200) return false;
  await drain(jar);
  return true;
}

async function main(): Promise<void> {
  const operator = new Jar();
  const created: string[] = [];
  let companyId: string | null = null;

  const { data: pilots, error: pilotsError } = await service.from("companies").select("id, name").order("created_at").limit(1);
  if (pilotsError || !pilots?.length) throw new Error("no pilot company");
  const pilot = pilots[0].id as string;
  const pilotBefore = await pilotCounts(pilot);

  try {
    // ---- the door --------------------------------------------------------------------
    record("чтение без сессии: 401", (await call(new Jar(), "/api/ops/companies")).status === 401);
    const noOrigin = await call(new Jar(), "/api/ops/auth/login", { body: { email: "a@b.co", password: "x" }, origin: null });
    record("запись без Origin: 403", noOrigin.status === 403);
    const foreign = await call(new Jar(), "/api/ops/auth/login", { body: { email: "a@b.co", password: "x" }, origin: "https://evil.example" });
    record("чужой Origin: 403", foreign.status === 403);
    const page = await fetch(`${APP_URL}/ops`, { redirect: "manual" });
    record("страница без сессии ведёт на вход консоли", (page.headers.get("location") ?? "").endsWith("/ops/login"), page.headers.get("location") ?? "");
    record("заголовки страницы", page.headers.get("x-frame-options") === "DENY" && page.headers.get("x-robots-tag") === "noindex");

    const stranger = await service.auth.admin.createUser({ email: STRANGER_EMAIL, password: PASSWORD, email_confirm: true });
    if (stranger.error || !stranger.data.user) throw new Error(`stranger: ${stranger.error?.message}`);
    created.push(stranger.data.user.id);
    const strangerJar = new Jar();
    const strangerLogin = await call(strangerJar, "/api/ops/auth/login", { body: { email: STRANGER_EMAIL, password: PASSWORD } });
    record("верный пароль не разработчика: тот же отказ, cookie нет", code(strangerLogin) === "invalid_credentials" && strangerJar.cookies.size === 0, String(strangerLogin.status));

    const strangerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    await strangerClient.auth.signInWithPassword({ email: STRANGER_EMAIL, password: PASSWORD });
    const directRead = await strangerClient.rpc("ops_companies" as never);
    record("чужой токен, чтение прямо из базы: отказ", directRead.error?.message === "ops_denied", directRead.error?.message ?? "прошло");
    const directTicket = await strangerClient.rpc("ops_ticket" as never, { p_action: "wipe_activity", p_company: pilot, p_target: {}, p_reason: "пробую обойти", p_client_request_id: crypto.randomUUID() } as never);
    record("чужой токен, билет: отказ", directTicket.error?.message === "ops_denied", directTicket.error?.message ?? "прошло");
    const directWipe = await strangerClient.rpc("ops_wipe_activity" as never, { p_ticket: crypto.randomUUID(), p_company: pilot, p_confirm_name: "x" } as never);
    record("чужой токен, запись прямо в базу: нет прав", directWipe.error?.code === "42501", directWipe.error?.code ?? "прошло");

    // ---- sign-in ---------------------------------------------------------------------
    const grantee = await service.auth.admin.createUser({ email: OPERATOR_EMAIL, password: PASSWORD, email_confirm: true });
    if (grantee.error || !grantee.data.user) throw new Error(`operator: ${grantee.error?.message}`);
    const operatorId = grantee.data.user.id;
    created.push(operatorId);
    const granted = await service.rpc("ops_grant_operator", { p_user: operatorId, p_note: "смоук" });
    if (granted.error) throw new Error(`grant: ${granted.error.message}`);

    const wrong = await call(new Jar(), "/api/ops/auth/login", { body: { email: OPERATOR_EMAIL, password: "wrong-password" } });
    record("неверный пароль: 400", code(wrong) === "invalid_credentials");

    const login = await call(operator, "/api/ops/auth/login", { body: { email: OPERATOR_EMAIL, password: PASSWORD } });
    record("пароль верный, первый вход: привязка приложения", login.body.next === "enroll", JSON.stringify(login.body));
    const cookieLine = operator.raw.find((line) => line.startsWith("pulse-ops-auth")) ?? "";
    record("cookie своя, HttpOnly, SameSite=Strict", /httponly/i.test(cookieLine) && /samesite=strict/i.test(cookieLine), cookieLine.split(";").slice(1).join(";").trim());
    record("только пароль, без кода: данные закрыты", (await call(operator, "/api/ops/companies")).status === 401);

    const enroll = await call(operator, "/api/ops/auth/enroll", { method: "POST" });
    const secret = enroll.body.secret as string;
    const factorId = enroll.body.factor_id as string;
    record("QR и секрет получены", Boolean(secret) && String(enroll.body.qr_svg).includes("<svg"));
    const badCode = await call(operator, "/api/ops/auth/verify", { body: { code: "000000", factor_id: factorId } });
    record("неверный код: 400", code(badCode) === "bad_code", String(badCode.status));
    const verified = await call(operator, "/api/ops/auth/verify", { body: { code: totp(secret), factor_id: factorId } });
    record("код из приложения принят", verified.status === 200, JSON.stringify(verified.body).slice(0, 120));

    const me = await call(operator, "/api/ops/me");
    record("/me: это разработчик", me.body.email === OPERATOR_EMAIL);
    const registry = await call(operator, "/api/ops/companies");
    const rows = (registry.body.companies ?? []) as { id: string; people: number }[];
    record("реестр видит пилот", rows.some((row) => row.id === pilot && row.people > 0), `${rows.length} компаний`);
    const pilotCard = await call(operator, `/api/ops/companies/${pilot}`);
    record("карточка пилота открывается", pilotCard.status === 200, `${((pilotCard.body.people ?? []) as unknown[]).length} человек`);
    record("журнал и список разработчиков", (await call(operator, "/api/ops/audit")).status === 200 && (await call(operator, "/api/ops/operators")).status === 200);

    for (const row of (rows as unknown as { id: string; name: string }[]).filter((company) => company.name.startsWith("Смоук консоли "))) {
      record(`хвост прошлого запуска убран: ${row.name}`, await removeCompany(operator, row.id, row.name));
    }

    await call(operator, "/api/ops/auth/logout", { method: "POST" });
    record("после выхода закрыто", (await call(operator, "/api/ops/companies")).status === 401);
    await nextWindow();
    const again = await call(operator, "/api/ops/auth/login", { body: { email: OPERATOR_EMAIL, password: PASSWORD } });
    record("повторный вход сразу просит код", again.body.next === "verify", JSON.stringify(again.body));
    await call(operator, "/api/ops/auth/verify", { body: { code: totp(secret) } });
    record("вошёл снова", (await call(operator, "/api/ops/companies")).status === 200);

    // ---- a company and its director ------------------------------------------------------
    const form = { name: COMPANY_NAME, slug: SLUG, director: { full_name: "Директор Смоуков", position: "Директор" }, parser: { provider: "deepseek" }, points_enabled: true };
    const firstWrite = why();
    const made = await call(operator, "/api/ops/companies", { body: { ...form, ...firstWrite } });
    record("компания создана", made.status === 200 || made.status === 201, JSON.stringify(made.body).slice(0, 160));
    companyId = made.body.company_id as string;
    const director = made.body.director_id as string;
    const issued = made.body.login as { code?: string; link?: string } | null;
    record("директор получил код и ссылку", /^\d{8}$/.test(issued?.code ?? "") && (issued?.link ?? "").endsWith(`/c/${SLUG}`), issued?.link ?? "");

    const replay = await call(operator, "/api/ops/companies", { body: { ...form, ...firstWrite } });
    record("повтор запроса: та же компания, кода нет", replay.body.company_id === companyId && replay.body.login === null && replay.body.duplicate === true);
    const taken = await call(operator, "/api/ops/companies", { body: { ...form, ...why() } });
    record("занятый адрес: slug_taken", code(taken) === "slug_taken", String(taken.status));

    const card = await call(operator, `/api/ops/companies/${companyId}`);
    const roles = ((card.body.people ?? []) as { role: string }[]).map((person) => person.role).sort();
    record("в компании директор и киоск", roles.join() === "director,tv", roles.join());
    const shop = await count("shop_items", "company_id", companyId);
    record("витрина заведена", shop === 4, String(shop));

    const directorJar = new Jar();
    const redeemed = await call(directorJar, "/api/auth/code", { body: { code: issued?.code, client_request_id: crypto.randomUUID() } });
    record("директор вошёл по коду", redeemed.status === 200, JSON.stringify(redeemed.body).slice(0, 120));
    const directorMe = await call(directorJar, "/api/me");
    record("директор в своей компании", JSON.stringify(directorMe.body).includes(companyId), JSON.stringify(directorMe.body).slice(0, 120));

    // ---- edits ---------------------------------------------------------------------------
    const added = await call(operator, `/api/ops/companies/${companyId}/people`, { body: { full_name: "Сотрудник Смоуков", role: "employee", ...why() } });
    const employee = added.body.user_id as string;
    record("человек добавлен", added.status === 200 || added.status === 201, employee);
    created.push(director, employee);

    const taskId = await seedActivity(companyId, director, employee, SECRET_TITLE);
    const extraTask = await seedActivity(companyId, director, employee, `${SECRET_TITLE} вторая`);
    const voicePath = await seedFile("voice", companyId, director);
    const deliveriesBefore = await count("notification_deliveries", "company_id", companyId);

    const edit = await call(operator, `/api/ops/people/${employee}`, { method: "PATCH", body: { company_id: companyId, full_name: "Сотрудник Изменённый", ...why() } });
    const editedName = (await service.from("profiles").select("full_name").eq("id", employee).single()).data?.full_name;
    record("имя изменено", edit.status === 200 && editedName === "Сотрудник Изменённый", String(edit.status));
    const toDirector = await call(operator, `/api/ops/people/${employee}`, { method: "PATCH", body: { company_id: companyId, is_active: true, ...why() } });
    record("правка «работает» проходит", toDirector.status === 200);
    const directorEdit = await call(operator, `/api/ops/people/${director}`, { method: "PATCH", body: { company_id: companyId, role: "employee", ...why() } });
    record("директора простой правкой не снять", code(directorEdit) === "use_change_director", String(directorEdit.status));
    const elsewhere = await call(operator, `/api/ops/people/${employee}`, { method: "PATCH", body: { company_id: pilot, full_name: "Чужая компания", ...why() } });
    record("человек не из этой компании: 404", elsewhere.status === 404, String(elsewhere.status));

    const points = await call(operator, `/api/ops/people/${employee}/points`, { body: { company_id: companyId, amount: 50, ...why() } });
    record("поправка очков", points.body.balance === 50, JSON.stringify(points.body));
    const personCode = why();
    const coded = await call(operator, `/api/ops/people/${employee}/login-code`, { body: { company_id: companyId, ...personCode } });
    const codedLogin = coded.body.login as { code?: string } | null;
    record("код человеку выдан", /^\d{8}$/.test(codedLogin?.code ?? ""), String(coded.status));
    const codeAgain = await call(operator, `/api/ops/people/${employee}/login-code`, { body: { company_id: companyId, ...personCode } });
    record("повтор кода не выдаёт", codeAgain.body.login === null && codeAgain.body.duplicate === true);
    const revoked = await call(operator, `/api/ops/people/${director}/sessions`, { body: { company_id: companyId, ...why() } });
    record("сессии директора сброшены", revoked.status === 200 && (revoked.body.sessions as number) >= 1, JSON.stringify(revoked.body));
    record("директор вышел сразу", (await call(directorJar, "/api/me")).status === 401);

    const looked = await call(operator, `/api/ops/companies/${companyId}/task-lookup`, { body: { task_id: taskId, ...why() } });
    record("задача по id открывается", (looked.body.task as { title?: string } | undefined)?.title === SECRET_TITLE, String(looked.status));
    const retitled = await call(operator, `/api/ops/tasks/${taskId}`, { method: "PATCH", body: { company_id: companyId, title: `${SECRET_TITLE} правка`, ...why() } });
    const titleNow = (await service.from("tasks").select("title").eq("id", taskId).single()).data?.title;
    record("текст задачи изменён", retitled.status === 200 && titleNow === `${SECRET_TITLE} правка`, String(retitled.status));
    const removed = await call(operator, `/api/ops/tasks/${extraTask}/delete`, { body: { company_id: companyId, ...why() } });
    record("задача удалена", removed.status === 200 && (await count("tasks", "id", extraTask)) === 0, String(removed.status));

    const settings = await call(operator, `/api/ops/companies/${companyId}`, { method: "PATCH", body: { dev_tools: true, settings: { lab_for_all: true }, ...why() } });
    const cardAfter = await call(operator, `/api/ops/companies/${companyId}`);
    const saved = cardAfter.body.settings as { dev_tools?: boolean; lab_for_all?: boolean };
    record("настройки сохранены, инструменты разработчиков открыты", settings.status === 200 && saved.dev_tools === true && saved.lab_for_all === true, JSON.stringify(saved));
    const rules = await call(operator, `/api/ops/companies/${companyId}`, { method: "PATCH", body: { settings: { parser_rules: {} }, ...why() } });
    record("правила разбора через консоль не правятся", rules.status === 400, String(rules.status));

    const deliveriesAfter = await count("notification_deliveries", "company_id", companyId);
    const { data: live } = await service.from("notification_deliveries").select("status").eq("company_id", companyId).order("created_at", { ascending: false }).limit(deliveriesAfter || 1);
    record("служебные правки без живых пушей", deliveriesAfter === deliveriesBefore || (live ?? []).slice(0, deliveriesAfter - deliveriesBefore).every((row) => row.status === "failed"), `${deliveriesBefore} → ${deliveriesAfter}`);

    // ---- a stale code ----------------------------------------------------------------------
    const aged = await sql(`update auth.mfa_amr_claims set created_at = now() - interval '10 minutes', updated_at = now() - interval '10 minutes' where session_id in (select id from auth.sessions where user_id = '${operatorId}')`);
    record("сессия состарена", aged.status < 300, String(aged.status));
    const staleBody = { company_id: companyId, amount: 1, ...why() };
    const stale = await call(operator, `/api/ops/people/${employee}/points`, { body: staleBody });
    record("опасное со старым кодом: 428", stale.status === 428, String(stale.status));
    await nextWindow();
    const fresh = await call(operator, "/api/ops/auth/verify", { body: { code: totp(secret) } });
    record("новый код принят", fresh.status === 200, JSON.stringify(fresh.body).slice(0, 100));
    const after = await call(operator, `/api/ops/people/${employee}/points`, { body: staleBody });
    record("то же действие после кода проходит", after.status === 200 && after.body.balance === 51, `${after.status} ${JSON.stringify(after.body)}`);

    // ---- changing the director -------------------------------------------------------------
    const changed = await call(operator, `/api/ops/companies/${companyId}/director`, { body: { old_id: director, new_id: employee, old_fate: "demote", ...why() } });
    record("директор сменён", changed.status === 200, JSON.stringify(changed.body).slice(0, 140));
    const authorNow = (await service.from("tasks").select("author_id").eq("id", taskId).single()).data?.author_id;
    record("открытая задача перешла новому", authorNow === employee);
    const newRole = (await service.from("profiles").select("role").eq("id", employee).single()).data?.role;
    const oldRole = (await service.from("profiles").select("role").eq("id", director).single()).data?.role;
    record("роли поменялись", newRole === "director" && oldRole === "employee", `${newRole} / ${oldRole}`);
    const third = await call(operator, `/api/ops/companies/${companyId}/director`, { body: { old_id: employee, new_person: { full_name: "Третий Директор" }, old_fate: "deactivate", ...why() } });
    record("директор из нового человека, прежний выключен", third.status === 200 && Boolean(third.body.new_id), JSON.stringify(third.body).slice(0, 120));
    const activeNow = (await service.from("profiles").select("is_active").eq("id", employee).single()).data?.is_active;
    record("прежний выключен", activeNow === false);
    const thirdId = third.body.new_id as string;
    created.push(thirdId);
    record("у нового директора есть вход", /^\d{8}$/.test((third.body.login as { code?: string } | null)?.code ?? ""));

    // ---- cleanup ---------------------------------------------------------------------------
    const footprint = await call(operator, `/api/ops/companies/${companyId}/footprint`);
    record("предпросмотр чистки считает файлы", (footprint.body.files as { voice: { count: number } }).voice.count === 1, JSON.stringify(footprint.body.files));
    const wrongName = await call(operator, `/api/ops/companies/${companyId}/wipe`, { body: { confirm_name: "не то", ...why() } });
    record("чистка с неверным названием: отказ", code(wrongName) === "confirm_mismatch", String(wrongName.status));
    const wiped = await call(operator, `/api/ops/companies/${companyId}/wipe`, { body: { confirm_name: COMPANY_NAME, ...why() } });
    record("чистка прошла", wiped.status === 200, JSON.stringify(wiped.body).slice(0, 160));
    record("дела и сообщения стёрты", (await count("tasks", "company_id", companyId)) === 0 && (await count("task_messages", "company_id", companyId)) === 0);
    record("люди и витрина на месте", (await count("profiles", "company_id", companyId)) >= 4 && (await count("shop_items", "company_id", companyId)) === 4);
    record("файл снят", (await drain(operator)) === 0);
    const voiceGone = await service.storage.from("voice").download(voicePath);
    record("файла в бакете больше нет", Boolean(voiceGone.error));

    await seedActivity(companyId, thirdId, thirdId, `${SECRET_TITLE} третья`);
    await seedFile("voice", companyId, thirdId);

    const noExport = await call(operator, `/api/ops/companies/${companyId}/purge`, { body: { confirm_name: COMPANY_NAME, ...why() } });
    record("удаление без выгрузки: отказ", code(noExport) === "export_required", String(noExport.status));

    const exportStart = await call(operator, `/api/ops/companies/${companyId}/export`, { body: why() });
    const exportId = exportStart.body.export_id as string;
    const tables = (exportStart.body.tables ?? []) as string[];
    record("выгрузка началась", exportStart.status === 200 || exportStart.status === 201, `${tables.length} таблиц`);
    const counts: Record<string, number> = {};
    for (const table of tables) {
      let offset = 0;
      counts[table] = 0;
      for (;;) {
        const part = await call(operator, `/api/ops/exports/${exportId}/page?table=${table}&offset=${offset}`);
        if (part.status !== 200) throw new Error(`export page ${table}: ${part.status} ${JSON.stringify(part.body).slice(0, 120)}`);
        const rowsHere = part.body.rows as unknown[];
        counts[table] += rowsHere.length;
        offset += rowsHere.length;
        if (part.body.done) break;
      }
    }
    record("таблицы выгружены", (counts.tasks ?? 0) === 1 && (counts.profiles ?? 0) >= 4, `задач ${counts.tasks}, людей ${counts.profiles}`);
    const notesOut = !tables.includes("notes") && !tables.includes("mind_boards");
    record("заметки и доски не выгружаются", notesOut);
    const files = await call(operator, `/api/ops/exports/${exportId}/files?offset=0`);
    const listed = (files.body.files ?? []) as { url: string }[];
    const fetched = listed.length ? await fetch(listed[0].url) : null;
    record("файл выгрузки скачивается", listed.length === 1 && fetched?.ok === true, `${listed.length} файл`);
    const manifest = createHash("sha256").update(JSON.stringify(counts)).digest("hex");
    const finished = await call(operator, `/api/ops/exports/${exportId}/finish`, { body: { sha256: manifest, counts } });
    record("выгрузка завершена", finished.status === 200, String(finished.status));

    const purged = await call(operator, `/api/ops/companies/${companyId}/purge`, { body: { confirm_name: COMPANY_NAME, ...why() } });
    record("компания удалена", purged.status === 200, JSON.stringify(purged.body).slice(0, 160));
    record("файлы сняты", (await drain(operator)) === 0);
    record("строки компании нет", (await count("companies", "id", companyId)) === 0);
    const leftovers = await sql(`select count(*) n from public.profiles where company_id = '${companyId}'`);
    record("людей нет", leftovers.text.includes('"n":0'), leftovers.text);
    const { data: gone } = await service.auth.admin.getUserById(director);
    record("входы людей удалены", !gone?.user);
    record("карточка больше не открывается", (await call(operator, `/api/ops/companies/${companyId}`)).status === 404);
    const deletedCompany = companyId;
    companyId = null;

    // ---- the journal ---------------------------------------------------------------------
    const audit = await call(operator, `/api/ops/audit?company=${deletedCompany}`);
    const lines = (audit.body.rows ?? []) as { action: string }[];
    const actions = new Set(lines.map((line) => line.action));
    record("журнал пережил компанию", actions.has("create_company") && actions.has("purge_company"), `${lines.length} строк`);
    const text = JSON.stringify(lines);
    record("в журнале нет текста задач и имён", !text.includes("Секретная") && !text.includes("Смоуков") && !text.includes("Изменённый"));
    const frozen = await sql("begin; update ops.audit set reason = 'подделка' where id = (select max(id) from ops.audit); rollback;");
    record("журнал нельзя изменить", frozen.status >= 400, frozen.text.slice(0, 90));

    // ---- the pilot, and the way out ----------------------------------------------------------
    const pilotAfter = await pilotCounts(pilot);
    record("пилот не изменился", pilotAfter === pilotBefore, `${pilotBefore} → ${pilotAfter}`);

    const taken2 = await service.rpc("ops_revoke_operator", { p_user: operatorId });
    record("доступ снят", !taken2.error, taken2.error?.message ?? "");
    record("снятый разработчик вылетел сразу", (await call(operator, "/api/ops/companies")).status === 401);
  } catch (error) {
    record("smoke:ops", false, error instanceof Error ? error.message : String(error));
  } finally {
    if (companyId && !(await removeCompany(operator, companyId, COMPANY_NAME).catch(() => false))) {
      console.log(`\nОСТАЛАСЬ тестовая компания ${companyId} (${COMPANY_NAME}): удалить из консоли`);
    }
    for (const id of new Set(created)) await service.auth.admin.deleteUser(id).catch(() => undefined);
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} ok`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

void main();
