import { apiOk } from "@/lib/api/respond";
import { UpdateTaskBodySchema, type UpdateTaskAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { changedFields } from "@/lib/ops/guard";
import { withOps } from "@/lib/ops/handler";
import type { Json } from "@/lib/supabase/types";

function patchOf(body: { title?: string; body?: string | null; deadline?: string | null }) {
  return { title: body.title, body: body.body, deadline: body.deadline };
}

export const PATCH = withOps(
  {
    schema: UpdateTaskBodySchema,
    action: "update_task",
    company: ({ body }) => body.company_id,
    target: ({ body, params }) => ({ task_id: params.id, fields: changedFields(patchOf(body)) }),
    replay: () => ({ ok: true }),
  },
  async ({ service, ticket, body, params }) => {
    await opsRpc(service, "ops_update_task", {
      p_ticket: ticket,
      p_company: body.company_id,
      p_task: params.id,
      // undefined keys vanish in JSON: the base sees only what changes
      p_patch: patchOf(body) as Json,
    });
    return apiOk({ ok: true, duplicate: false } satisfies UpdateTaskAnswer);
  },
);
