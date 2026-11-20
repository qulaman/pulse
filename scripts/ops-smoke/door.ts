/** The door of the console: nothing without a session, no foreign Origin, no stranger — not even straight into the base. */
import { apiSession, APP_URL, record } from "../lib/smoke";

import { call, code, Jar, RUN, type OpsCtx } from "./shared";

export async function checkDoor(ctx: OpsCtx) {
  record("чтение без сессии: 401", (await call(new Jar(), "/api/ops/companies")).status === 401);
  const noOrigin = await call(new Jar(), "/api/ops/auth/login", { body: { email: "a@b.co", password: "x" }, origin: null });
  record("запись без Origin: 403", noOrigin.status === 403);
  const foreign = await call(new Jar(), "/api/ops/auth/login", { body: { email: "a@b.co", password: "x" }, origin: "https://evil.example" });
  record("чужой Origin: 403", foreign.status === 403);
  const page = await fetch(`${APP_URL}/ops`, { redirect: "manual" });
  record("страница без сессии ведёт на вход консоли", (page.headers.get("location") ?? "").endsWith("/ops/login"), page.headers.get("location") ?? "");
  record("заголовки страницы", page.headers.get("x-frame-options") === "DENY" && page.headers.get("x-robots-tag") === "noindex");

  const stranger = await ctx.service.auth.admin.createUser({ email: RUN.strangerEmail, password: RUN.password, email_confirm: true });
  if (stranger.error || !stranger.data.user) throw new Error(`stranger: ${stranger.error?.message}`);
  ctx.created.push(stranger.data.user.id);
  const strangerJar = new Jar();
  const strangerLogin = await call(strangerJar, "/api/ops/auth/login", { body: { email: RUN.strangerEmail, password: RUN.password } });
  const sameRefusal = code(strangerLogin) === "invalid_credentials" && strangerJar.cookies.size === 0;
  record("верный пароль не разработчика: тот же отказ, cookie нет", sameRefusal, String(strangerLogin.status));

  const { supabase: strangerClient } = await apiSession(RUN.strangerEmail, RUN.password);
  const directRead = await strangerClient.rpc("ops_companies");
  record("чужой токен, чтение прямо из базы: отказ", directRead.error?.message === "ops_denied", directRead.error?.message ?? "прошло");
  const ticket = { p_action: "wipe_activity", p_company: ctx.pilot, p_target: {}, p_reason: "пробую обойти", p_client_request_id: crypto.randomUUID() };
  const directTicket = await strangerClient.rpc("ops_ticket", ticket);
  record("чужой токен, билет: отказ", directTicket.error?.message === "ops_denied", directTicket.error?.message ?? "прошло");
  const directWipe = await strangerClient.rpc("ops_wipe_activity", { p_ticket: crypto.randomUUID(), p_company: ctx.pilot, p_confirm_name: "x" });
  record("чужой токен, запись прямо в базу: нет прав", directWipe.error?.code === "42501", directWipe.error?.code ?? "прошло");
}
