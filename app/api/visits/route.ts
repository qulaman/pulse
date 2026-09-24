import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z
  .strictObject({
    /** «Иванов, по поставкам» — optional for a visitor: the button works with no words at all. */
    note: z.string().trim().max(120).optional(),
    client_request_id: z.uuid(),
    /** `message` — the secretary's words on the office wall (D-116). */
    kind: z.enum(["visitor", "message"]).default("visitor"),
  })
  .refine((body) => body.kind !== "message" || Boolean(body.note), { message: "empty_message", path: ["note"] });

/**
 * «Посетитель» (D-96) and «Сообщение» (D-116): the secretary tells the director somebody is
 * at the reception, or writes to the office wall. One RPC writes the row and lifts the wall's
 * version, so the office screen shows it; the push to the director is kicked at once.
 * A repeat of the same client_request_id returns the same row (principle 7).
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["secretary"],
  async ({ req, body }) => {
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("announce_visit", {
      p_note: body.note || undefined,
      client_request_id: body.client_request_id,
      // only a message names its kind: a visitor call matches the pre-D-116 signature too,
      // so the button keeps working on a database the migration has not reached yet
      ...(body.kind === "message" ? { p_kind: "message" } : {}),
    });
    if (error) {
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      if (error.message.includes("empty_message")) return apiError(400, "empty_message", "Напиши, что показать директору");
      throw new Error(`announce_visit failed: ${error.message}`);
    }
    after(() => kickDeliveries());
    return apiOk({ visit: data });
  },
  BodySchema,
);
