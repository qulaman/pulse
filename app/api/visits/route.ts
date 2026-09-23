import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  /** «Иванов, по поставкам» — optional: the button works with no words at all. */
  note: z.string().trim().max(120).optional(),
  client_request_id: z.uuid(),
});

/**
 * «Посетитель» (D-96): the secretary tells the director somebody is at the reception. One
 * RPC writes the visit and lifts the wall's version, so the office screen shows «К вам
 * посетитель»; the push to the director is kicked at once — a person is standing there.
 * A repeat of the same client_request_id returns the same visit (principle 7).
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["secretary"],
  async ({ req, body }) => {
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("announce_visit", {
      p_note: body.note || undefined,
      client_request_id: body.client_request_id,
    });
    if (error) {
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      throw new Error(`announce_visit failed: ${error.message}`);
    }
    after(() => kickDeliveries());
    return apiOk({ visit: data });
  },
  BodySchema,
);
