import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk, rpcFailure } from "@/lib/api/respond";
import { DAILY_REPORT_ERROR_TEXT } from "@/lib/daily-report/format";
import { DAILY_REPORT_RPC, type CheckDailyReportsResult } from "@/lib/daily-report/types";
import { rpcJson } from "@/lib/supabase/rpc";

const BodySchema = z.strictObject({
  ids: z.array(z.uuid()).min(1).max(200),
  on: z.boolean(),
  client_request_id: z.uuid(),
});

/**
 * «Проверено» on / off (D-198): the body is `CheckDailyReportsInput`, the answer
 * `CheckDailyReportsResult`. A route rather than a bare RPC call so a tap made without network
 * waits in the outbox, which replays POSTs (lib/outbox.ts); the RPC under the director's session
 * marks only the company's submitted reports and answers a replay of the same
 * `client_request_id` with the first answer (принцип 7). No push: the check is a mark, not news.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body }) => {
    const supabase = await userSupabase(req);
    const { data, error } = await rpcJson<CheckDailyReportsResult | null>(
      supabase.rpc(DAILY_REPORT_RPC.check, { p_ids: body.ids, p_on: body.on, client_request_id: body.client_request_id }),
    );

    if (error) {
      const refusals = {
        forbidden: [403, DAILY_REPORT_ERROR_TEXT.forbidden],
        bad_ids: [400, DAILY_REPORT_ERROR_TEXT.bad_ids],
      } as const;
      return rpcFailure(error, refusals, "check_daily_reports");
    }

    return apiOk(data ?? { reports: [] });
  },
  BodySchema,
);
