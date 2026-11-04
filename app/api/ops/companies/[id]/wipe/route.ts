import { apiOk } from "@/lib/api/respond";
import { WipeBodySchema, type WipeAnswer } from "@/lib/ops/contract";
import { cleanupAnswer, drainStorage, opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

export const maxDuration = 60;

/** The rows go in one transaction; the files right after it, what stays is left to the sweep. */
export const POST = withOps(
  {
    schema: WipeBodySchema,
    action: "wipe_activity",
    company: ({ params }) => params.id,
    target: ({ params }) => ({ company_id: params.id }),
    replay: (result, { service, params }) => cleanupAnswer(service, params.id, result),
  },
  async ({ service, ticket, body, params }) => {
    const result = await opsRpc(service, "ops_wipe_activity", {
      p_ticket: ticket,
      p_company: params.id,
      p_confirm_name: body.confirm_name,
    });
    await drainStorage(service, 40_000);
    return apiOk({ ...(await cleanupAnswer(service, params.id, result)), duplicate: false } satisfies WipeAnswer);
  },
);
