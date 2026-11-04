import { apiOk } from "@/lib/api/respond";
import { DeleteTaskBodySchema, type DeleteTaskAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

export const POST = withOps(
  {
    schema: DeleteTaskBodySchema,
    action: "delete_task",
    company: ({ body }) => body.company_id,
    target: ({ params }) => ({ task_id: params.id }),
    replay: () => ({ ok: true }),
  },
  async ({ service, ticket, body, params }) => {
    await opsRpc(service, "ops_delete_task", { p_ticket: ticket, p_company: body.company_id, p_task: params.id });
    return apiOk({ ok: true, duplicate: false } satisfies DeleteTaskAnswer);
  },
);
