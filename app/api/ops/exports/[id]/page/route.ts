import { apiError, apiOk } from "@/lib/api/respond";
import type { ExportPageAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

const PAGE = 500;

/** One page of one table; the white list and the 30 minutes are the base's. */
export const GET = withOps({ gate: "operator" }, async ({ req, service, params }) => {
  const query = new URL(req.url).searchParams;
  const table = query.get("table") ?? "";
  const offset = Number(query.get("offset") ?? 0);
  if (!/^[a-z_]{1,63}$/.test(table) || !Number.isSafeInteger(offset) || offset < 0) {
    return apiError(400, "validation_error", "Неверный запрос");
  }

  const rows = await opsRpc(service, "ops_export_page", {
    p_export: params.id,
    p_table: table,
    p_offset: offset,
    p_limit: PAGE,
  });
  return apiOk({ rows, done: rows.length < PAGE } satisfies ExportPageAnswer);
});
