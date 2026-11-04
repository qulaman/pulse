import { apiOk } from "@/lib/api/respond";
import { ExportStartBodySchema, type ExportStartAnswer } from "@/lib/ops/contract";
import { OPS_EXPORT_TABLES, opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

/** The start of an export: the browser then walks the tables and files itself, into a folder. */
export const POST = withOps(
  {
    schema: ExportStartBodySchema,
    action: "export_company",
    company: ({ params }) => params.id,
    target: ({ params }) => ({ company_id: params.id }),
  },
  async ({ service, ticket, params }) => {
    const exportId = await opsRpc(service, "ops_export_begin", { p_ticket: ticket, p_company: params.id });
    return apiOk({ export_id: exportId, tables: [...OPS_EXPORT_TABLES], duplicate: false } satisfies ExportStartAnswer);
  },
);
