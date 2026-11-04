import { apiError, apiOk } from "@/lib/api/respond";
import type { AuditAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { isGuid } from "@/lib/ops/guard";
import { withOps } from "@/lib/ops/handler";

const PAGE = 100;

/** Newest first; `next_before` is the id to continue from. */
export const GET = withOps({ gate: "read" }, async ({ req, db }) => {
  const query = new URL(req.url).searchParams;
  const before = query.get("before");
  const company = query.get("company");
  if ((before !== null && !/^\d{1,15}$/.test(before)) || (company !== null && !isGuid(company))) {
    return apiError(400, "validation_error", "Неверный запрос");
  }

  const rows = await opsRpc(db, "ops_audit_list", {
    p_before: before === null ? null : Number(before),
    p_limit: PAGE,
    p_company: company,
  });
  return apiOk({ rows, next_before: rows.length === PAGE ? rows[rows.length - 1].id : null } satisfies AuditAnswer);
});
