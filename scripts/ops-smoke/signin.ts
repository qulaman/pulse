/** The operator's way in: password, then the authenticator app; out and back in asks for the code at once. */
import { record } from "../lib/smoke";

import { call, code, Jar, nextWindow, removeCompany, RUN, totp, type OpsCtx } from "./shared";

export async function checkSignIn(ctx: OpsCtx) {
  const { operator } = ctx;
  const grantee = await ctx.service.auth.admin.createUser({ email: RUN.operatorEmail, password: RUN.password, email_confirm: true });
  if (grantee.error || !grantee.data.user) throw new Error(`operator: ${grantee.error?.message}`);
  ctx.operatorId = grantee.data.user.id;
  ctx.created.push(ctx.operatorId);
  const granted = await ctx.service.rpc("ops_grant_operator", { p_user: ctx.operatorId, p_note: "смоук" });
  if (granted.error) throw new Error(`grant: ${granted.error.message}`);

  const wrong = await call(new Jar(), "/api/ops/auth/login", { body: { email: RUN.operatorEmail, password: "wrong-password" } });
  record("неверный пароль: 400", code(wrong) === "invalid_credentials");

  const login = await call(operator, "/api/ops/auth/login", { body: { email: RUN.operatorEmail, password: RUN.password } });
  record("пароль верный, первый вход: привязка приложения", login.body.next === "enroll", JSON.stringify(login.body));
  const cookieLine = operator.raw.find((line) => line.startsWith("pulse-ops-auth")) ?? "";
  const strictCookie = /httponly/i.test(cookieLine) && /samesite=strict/i.test(cookieLine);
  record("cookie своя, HttpOnly, SameSite=Strict", strictCookie, cookieLine.split(";").slice(1).join(";").trim());
  record("только пароль, без кода: данные закрыты", (await call(operator, "/api/ops/companies")).status === 401);

  const enroll = await call(operator, "/api/ops/auth/enroll", { method: "POST" });
  ctx.secret = enroll.body.secret as string;
  const factorId = enroll.body.factor_id as string;
  record("QR и секрет получены", Boolean(ctx.secret) && String(enroll.body.qr_svg).includes("<svg"));
  const badCode = await call(operator, "/api/ops/auth/verify", { body: { code: "000000", factor_id: factorId } });
  record("неверный код: 400", code(badCode) === "bad_code", String(badCode.status));
  const verified = await call(operator, "/api/ops/auth/verify", { body: { code: totp(ctx.secret), factor_id: factorId } });
  record("код из приложения принят", verified.status === 200, JSON.stringify(verified.body).slice(0, 120));

  const me = await call(operator, "/api/ops/me");
  record("/me: это разработчик", me.body.email === RUN.operatorEmail);
  const registry = await call(operator, "/api/ops/companies");
  const rows = (registry.body.companies ?? []) as { id: string; name: string; people: number }[];
  record("реестр видит пилот", rows.some((row) => row.id === ctx.pilot && row.people > 0), `${rows.length} компаний`);
  const pilotCard = await call(operator, `/api/ops/companies/${ctx.pilot}`);
  record("карточка пилота открывается", pilotCard.status === 200, `${((pilotCard.body.people ?? []) as unknown[]).length} человек`);
  const journalOpens = (await call(operator, "/api/ops/audit")).status === 200 && (await call(operator, "/api/ops/operators")).status === 200;
  record("журнал и список разработчиков", journalOpens);

  for (const row of rows.filter((company) => company.name.startsWith("Смоук консоли "))) {
    record(`хвост прошлого запуска убран: ${row.name}`, await removeCompany(operator, row.id, row.name));
  }

  await call(operator, "/api/ops/auth/logout", { method: "POST" });
  record("после выхода закрыто", (await call(operator, "/api/ops/companies")).status === 401);
  await nextWindow();
  const again = await call(operator, "/api/ops/auth/login", { body: { email: RUN.operatorEmail, password: RUN.password } });
  record("повторный вход сразу просит код", again.body.next === "verify", JSON.stringify(again.body));
  await call(operator, "/api/ops/auth/verify", { body: { code: totp(ctx.secret) } });
  record("вошёл снова", (await call(operator, "/api/ops/companies")).status === 200);
}
