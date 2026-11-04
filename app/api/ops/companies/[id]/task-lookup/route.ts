import { apiOk } from "@/lib/api/respond";
import { TaskLookupBodySchema, type TaskLookupAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

/** A company's task is private: reading one by hand is an action, with a reason and a journal line. */
export const POST = withOps(
  {
    schema: TaskLookupBodySchema,
    action: "task_lookup",
    company: ({ params }) => params.id,
    target: ({ body }) => ({ task_id: body.task_id }),
    replay: (result) => ({ task: result.task }),
  },
  async ({ service, ticket, body, params }) => {
    const task = await opsRpc(service, "ops_task_get", {
      p_ticket: ticket,
      p_company_or_null: params.id,
      p_task: body.task_id,
    });
    return apiOk({ task, duplicate: false } satisfies TaskLookupAnswer);
  },
);
