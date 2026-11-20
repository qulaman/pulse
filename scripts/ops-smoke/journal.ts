/** The journal outlives the company and keeps no words of it; the pilot did not move; the operator's way out. */
import { record } from "../lib/smoke";

import { call, pilotCounts, sql, type OpsCtx } from "./shared";

export async function checkJournal(ctx: OpsCtx) {
  const audit = await call(ctx.operator, `/api/ops/audit?company=${ctx.deletedCompany}`);
  const lines = (audit.body.rows ?? []) as { action: string }[];
  const actions = new Set(lines.map((line) => line.action));
  record("журнал пережил компанию", actions.has("create_company") && actions.has("purge_company"), `${lines.length} строк`);
  const text = JSON.stringify(lines);
  record("в журнале нет текста задач и имён", !text.includes("Секретная") && !text.includes("Смоуков") && !text.includes("Изменённый"));
  const frozen = await sql("begin; update ops.audit set reason = 'подделка' where id = (select max(id) from ops.audit); rollback;");
  record("журнал нельзя изменить", frozen.status >= 400, frozen.text.slice(0, 90));

  const pilotAfter = await pilotCounts(ctx);
  record("пилот не изменился", pilotAfter === ctx.pilotBefore, `${ctx.pilotBefore} → ${pilotAfter}`);

  const revoked = await ctx.service.rpc("ops_revoke_operator", { p_user: ctx.operatorId });
  record("доступ снят", !revoked.error, revoked.error?.message ?? "");
  record("снятый разработчик вылетел сразу", (await call(ctx.operator, "/api/ops/companies")).status === 401);
}
