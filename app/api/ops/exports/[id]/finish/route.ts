import { apiOk } from "@/lib/api/respond";
import { ExportFinishBodySchema, type ExportFinishAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

/** The browser's manifest hash and counts: from here the purge may go for a day. */
export const POST = withOps({ gate: "operator", schema: ExportFinishBodySchema }, async ({ service, body, params }) => {
  await opsRpc(service, "ops_export_finish", { p_export: params.id, p_sha256: body.sha256, p_counts: body.counts });
  return apiOk({ ok: true } satisfies ExportFinishAnswer);
});
