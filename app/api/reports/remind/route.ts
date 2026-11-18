import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { DAILY_REPORT_RPC, type RemindDailyReportResult } from "@/lib/daily-report/types";
import { todayYmd } from "@/lib/datetime/calendar";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  user_ids: z.array(z.uuid()).min(1).max(100),
  client_request_id: z.uuid(),
  /** The Aqtobe day of the tap: a tap kept in the outbox overnight is not a reminder about the next day. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * «Напомнить» on the desk's «Отчёты» (D-183): a «Директор ждёт отчёт за день» push to the ones who
 * owe today's report — one a person a day, the evening sweep's own included, through the
 * company's delivery window. The RPC under the director's session decides who is reminded and
 * why the rest are not (`skipped`), and dedupes a replay by `client_request_id` (принцип 7);
 * the route only kicks the queue so the push leaves now rather than at the next sweep.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body }) => {
    // the RPC reminds about today; a tap from another day (replayed late) is refused, not re-aimed
    if (body.date && body.date !== todayYmd()) {
      return apiError(409, "stale_day", "Тот день уже прошёл — напоминание не отправил");
    }
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc(DAILY_REPORT_RPC.remind, {
      p_user_ids: body.user_ids,
      client_request_id: body.client_request_id,
    });

    if (error) {
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Напоминать может только директор");
      if (error.message.includes("bad_request")) return apiError(400, "bad_request", "Выберите от одного до ста человек");
      throw new Error(`remind_daily_report failed: ${error.message}`);
    }

    const result = (data ?? {}) as unknown as RemindDailyReportResult & { duplicate?: boolean };
    // a replay queued nothing new; a held push (night) waits for the window in the queue anyway
    if (!result.duplicate && result.reminded?.length) after(() => kickDeliveries());
    return apiOk(result);
  },
  BodySchema,
);
