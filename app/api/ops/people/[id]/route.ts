import { apiOk } from "@/lib/api/respond";
import { UpdatePersonBodySchema, type UpdatePersonAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { changedFields } from "@/lib/ops/guard";
import { withOps } from "@/lib/ops/handler";

function patchOf(body: { full_name?: string; position?: string | null; role?: string; is_active?: boolean }) {
  const { full_name, position, role, is_active } = body;
  return { full_name, position, role, is_active };
}

export const PATCH = withOps(
  {
    schema: UpdatePersonBodySchema,
    action: "update_person",
    company: ({ body }) => body.company_id,
    target: ({ body, params }) => ({ user_id: params.id, fields: changedFields(patchOf(body)) }),
    replay: () => ({ ok: true }),
  },
  async ({ service, ticket, body, params }) => {
    await opsRpc(service, "ops_update_person", {
      p_ticket: ticket,
      p_company: body.company_id,
      p_user: params.id,
      // undefined keys vanish in JSON: the base sees only what changes
      p_patch: patchOf(body),
    });
    return apiOk({ ok: true, duplicate: false } satisfies UpdatePersonAnswer);
  },
);
