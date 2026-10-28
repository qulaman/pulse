import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { DAILY_REPORT_ERROR_TEXT, errorCodeOf } from "@/lib/daily-report/format";
import { DAILY_REPORT_RPC, type SubmitDailyReportResult } from "@/lib/daily-report/types";
import { TEAM_ROLES } from "@/lib/routes";

const BodySchema = z.strictObject({
  arrived_at: z.string().min(1),
  left_at: z.string().min(1),
  summary: z.string(),
  client_request_id: z.uuid(),
});

/**
 * «Сдать отчёт» (D-152): the body is `SubmitDailyReportInput`, the answer `SubmitDailyReportResult`.
 * A route rather than a bare RPC call so a submit made without network can wait in the outbox,
 * which replays POSTs (lib/outbox.ts); the RPC under the caller's session does the work and the
 * dedupe — upsert by (user, day), the +1 by its unique index, the key written into the row.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  [...TEAM_ROLES],
  async ({ req, body }) => {
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc(DAILY_REPORT_RPC.submit, {
      p_arrived_at: body.arrived_at,
      p_left_at: body.left_at,
      p_summary: body.summary,
      client_request_id: body.client_request_id,
    });

    if (error) {
      const code = errorCodeOf(error.message);
      if (code === "forbidden" || code === "not_team_member") return apiError(403, code, DAILY_REPORT_ERROR_TEXT[code]);
      if (code === "daily_report_disabled") return apiError(409, code, DAILY_REPORT_ERROR_TEXT[code]);
      if (code) return apiError(400, code, DAILY_REPORT_ERROR_TEXT[code]);
      throw new Error(`submit_daily_report failed: ${error.message}`);
    }

    return apiOk(data as unknown as SubmitDailyReportResult);
  },
  BodySchema,
);
