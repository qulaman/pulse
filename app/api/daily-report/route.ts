import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { DAILY_REPORT_ERROR_TEXT, errorCodeOf } from "@/lib/daily-report/format";
import { DAILY_REPORT_RPC } from "@/lib/daily-report/types";
import { TEAM_ROLES } from "@/lib/routes";

const BodySchema = z.strictObject({
  // D-198: the report asks no «Пришёл / Ушёл» — a new client sends neither; a submit of an older
  // build waiting in an outbox still carries both, and the RPC keeps them as typed
  arrived_at: z.string().min(1).nullish(),
  left_at: z.string().min(1).nullish(),
  summary: z.string(),
  client_request_id: z.uuid(),
  /**
   * The Aqtobe day of the tap: a submit kept in the outbox past midnight lands on the day it was
   * made while that day is still open (without times the arrival no longer says it).
   */
  date: z.iso.date().optional(),
});

/** The RPC's times default to null; the generated args do not spell null, the SQL takes it. */
const NO_TIME = null as unknown as string;

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
      p_arrived_at: body.arrived_at ?? NO_TIME,
      p_left_at: body.left_at ?? NO_TIME,
      p_summary: body.summary,
      client_request_id: body.client_request_id,
      ...(body.date ? { p_day: body.date } : {}),
    });

    if (error) {
      const code = errorCodeOf(error.message);
      if (code === "forbidden" || code === "not_team_member") return apiError(403, code, DAILY_REPORT_ERROR_TEXT[code]);
      if (code === "daily_report_disabled") return apiError(409, code, DAILY_REPORT_ERROR_TEXT[code]);
      if (code) return apiError(400, code, DAILY_REPORT_ERROR_TEXT[code]);
      throw new Error(`submit_daily_report failed: ${error.message}`);
    }

    // the answer is SubmitDailyReportResult (lib/daily-report/types.ts), passed on as is
    return apiOk(data);
  },
  BodySchema,
);
