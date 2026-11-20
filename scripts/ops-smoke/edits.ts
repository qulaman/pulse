/**
 * Every write of the console on the throw-away company: people, points, codes, sessions, a task by
 * its id, settings; a dangerous write with a stale code waits for a fresh one; the director changes
 * twice — to a person of the company, then to a new one.
 */
import { record } from "../lib/smoke";

import { call, code, count, nextWindow, RUN, seedActivity, seedFile, sql, totp, why, type OpsCtx } from "./shared";

export async function checkEdits(ctx: OpsCtx) {
  const { operator, service, director } = ctx;
  const companyId = ctx.companyId;
  if (!companyId) throw new Error("no company to edit");

  const added = await call(operator, `/api/ops/companies/${companyId}/people`, { body: { full_name: "Сотрудник Смоуков", role: "employee", ...why() } });
  const employee = added.body.user_id as string;
  ctx.employee = employee;
  record("человек добавлен", added.status === 200 || added.status === 201, employee);
  ctx.created.push(director, employee);

  ctx.taskId = await seedActivity(ctx, companyId, director, employee, RUN.secretTitle);
  const extraTask = await seedActivity(ctx, companyId, director, employee, `${RUN.secretTitle} вторая`);
  ctx.voicePath = await seedFile(ctx, "voice", companyId, director);
  const deliveriesBefore = await count(ctx, "notification_deliveries", "company_id", companyId);

  const edit = await call(operator, `/api/ops/people/${employee}`, { method: "PATCH", body: { company_id: companyId, full_name: "Сотрудник Изменённый", ...why() } });
  const editedName = (await service.from("profiles").select("full_name").eq("id", employee).single()).data?.full_name;
  record("имя изменено", edit.status === 200 && editedName === "Сотрудник Изменённый", String(edit.status));
  const toDirector = await call(operator, `/api/ops/people/${employee}`, { method: "PATCH", body: { company_id: companyId, is_active: true, ...why() } });
  record("правка «работает» проходит", toDirector.status === 200);
  const directorEdit = await call(operator, `/api/ops/people/${director}`, { method: "PATCH", body: { company_id: companyId, role: "employee", ...why() } });
  record("директора простой правкой не снять", code(directorEdit) === "use_change_director", String(directorEdit.status));
  const elsewhere = await call(operator, `/api/ops/people/${employee}`, { method: "PATCH", body: { company_id: ctx.pilot, full_name: "Чужая компания", ...why() } });
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
  record("директор вышел сразу", (await call(ctx.directorJar, "/api/me")).status === 401);

  const looked = await call(operator, `/api/ops/companies/${companyId}/task-lookup`, { body: { task_id: ctx.taskId, ...why() } });
  record("задача по id открывается", (looked.body.task as { title?: string } | undefined)?.title === RUN.secretTitle, String(looked.status));
  const retitledTo = `${RUN.secretTitle} правка`;
  const retitled = await call(operator, `/api/ops/tasks/${ctx.taskId}`, { method: "PATCH", body: { company_id: companyId, title: retitledTo, ...why() } });
  const titleNow = (await service.from("tasks").select("title").eq("id", ctx.taskId).single()).data?.title;
  record("текст задачи изменён", retitled.status === 200 && titleNow === retitledTo, String(retitled.status));
  const removed = await call(operator, `/api/ops/tasks/${extraTask}/delete`, { body: { company_id: companyId, ...why() } });
  record("задача удалена", removed.status === 200 && (await count(ctx, "tasks", "id", extraTask)) === 0, String(removed.status));

  const settings = await call(operator, `/api/ops/companies/${companyId}`, { method: "PATCH", body: { dev_tools: true, settings: { lab_for_all: true }, ...why() } });
  const cardAfter = await call(operator, `/api/ops/companies/${companyId}`);
  const saved = cardAfter.body.settings as { dev_tools?: boolean; lab_for_all?: boolean };
  const devToolsOpen = settings.status === 200 && saved.dev_tools === true && saved.lab_for_all === true;
  record("настройки сохранены, инструменты разработчиков открыты", devToolsOpen, JSON.stringify(saved));
  const rules = await call(operator, `/api/ops/companies/${companyId}`, { method: "PATCH", body: { settings: { parser_rules: {} }, ...why() } });
  record("правила разбора через консоль не правятся", rules.status === 400, String(rules.status));

  const deliveriesAfter = await count(ctx, "notification_deliveries", "company_id", companyId);
  const { data: live } = await service
    .from("notification_deliveries")
    .select("status")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(deliveriesAfter || 1);
  const noLivePush = deliveriesAfter === deliveriesBefore || (live ?? []).slice(0, deliveriesAfter - deliveriesBefore).every((row) => row.status === "failed");
  record("служебные правки без живых пушей", noLivePush, `${deliveriesBefore} → ${deliveriesAfter}`);

  await checkStaleCode(ctx, companyId);
  await checkDirectorChange(ctx, companyId);
}

/** A dangerous write with a code older than a few minutes waits for a fresh one. */
async function checkStaleCode(ctx: OpsCtx, companyId: string) {
  const { operator, employee } = ctx;
  const aged = await sql(
    `update auth.mfa_amr_claims set created_at = now() - interval '10 minutes', updated_at = now() - interval '10 minutes' where session_id in (select id from auth.sessions where user_id = '${ctx.operatorId}')`,
  );
  record("сессия состарена", aged.status < 300, String(aged.status));
  const staleBody = { company_id: companyId, amount: 1, ...why() };
  const stale = await call(operator, `/api/ops/people/${employee}/points`, { body: staleBody });
  record("опасное со старым кодом: 428", stale.status === 428, String(stale.status));
  await nextWindow();
  const fresh = await call(operator, "/api/ops/auth/verify", { body: { code: totp(ctx.secret) } });
  record("новый код принят", fresh.status === 200, JSON.stringify(fresh.body).slice(0, 100));
  const after = await call(operator, `/api/ops/people/${employee}/points`, { body: staleBody });
  record("то же действие после кода проходит", after.status === 200 && after.body.balance === 51, `${after.status} ${JSON.stringify(after.body)}`);
}

/** The director changes: to the employee (the old one demoted), then to a new person (the old one switched off). */
async function checkDirectorChange(ctx: OpsCtx, companyId: string) {
  const { operator, service, director, employee } = ctx;
  const changed = await call(operator, `/api/ops/companies/${companyId}/director`, { body: { old_id: director, new_id: employee, old_fate: "demote", ...why() } });
  record("директор сменён", changed.status === 200, JSON.stringify(changed.body).slice(0, 140));
  const authorNow = (await service.from("tasks").select("author_id").eq("id", ctx.taskId).single()).data?.author_id;
  record("открытая задача перешла новому", authorNow === employee);
  const newRole = (await service.from("profiles").select("role").eq("id", employee).single()).data?.role;
  const oldRole = (await service.from("profiles").select("role").eq("id", director).single()).data?.role;
  record("роли поменялись", newRole === "director" && oldRole === "employee", `${newRole} / ${oldRole}`);
  const third = await call(operator, `/api/ops/companies/${companyId}/director`, {
    body: { old_id: employee, new_person: { full_name: "Третий Директор" }, old_fate: "deactivate", ...why() },
  });
  record("директор из нового человека, прежний выключен", third.status === 200 && Boolean(third.body.new_id), JSON.stringify(third.body).slice(0, 120));
  const activeNow = (await service.from("profiles").select("is_active").eq("id", employee).single()).data?.is_active;
  record("прежний выключен", activeNow === false);
  ctx.thirdId = third.body.new_id as string;
  ctx.created.push(ctx.thirdId);
  record("у нового директора есть вход", /^\d{8}$/.test((third.body.login as { code?: string } | null)?.code ?? ""));
}
