import { apiOk } from "@/lib/api/respond";
import { AdjustPointsBodySchema, type AdjustPointsAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

/** A correction is one more row of the ledger (principle 4), and the reason on it is the operator's. */
export const POST = withOps(
  {
    schema: AdjustPointsBodySchema,
    action: "adjust_points",
    company: ({ body }) => body.company_id,
    target: ({ body, params }) => ({ user_id: params.id, amount: body.amount }),
    replay: ({ balance }) => ({ balance }),
  },
  async ({ service, ticket, body, params }) => {
    const { balance } = await opsRpc(service, "ops_adjust_points", {
      p_ticket: ticket,
      p_company: body.company_id,
      p_user: params.id,
      p_amount: body.amount,
      p_reason: body.reason,
    });
    return apiOk({ balance, duplicate: false } satisfies AdjustPointsAnswer);
  },
);
