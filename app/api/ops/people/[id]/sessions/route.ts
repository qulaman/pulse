import { apiOk } from "@/lib/api/respond";
import { RevokeSessionsBodySchema, type RevokeSessionsAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

export const POST = withOps(
  {
    schema: RevokeSessionsBodySchema,
    action: "revoke_sessions",
    company: ({ body }) => body.company_id,
    target: ({ params }) => ({ user_id: params.id }),
    replay: ({ sessions, devices }) => ({ sessions, devices }),
  },
  async ({ service, ticket, body, params }) => {
    const result = await opsRpc(service, "ops_revoke_sessions", {
      p_ticket: ticket,
      p_company: body.company_id,
      p_user: params.id,
    });
    return apiOk({ sessions: result.sessions, devices: result.devices, duplicate: false } satisfies RevokeSessionsAnswer);
  },
);
