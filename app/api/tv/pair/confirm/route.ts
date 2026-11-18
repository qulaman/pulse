import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { hashCode, sameOrigin } from "@/lib/login-code/server";
import { confirmError, readPairCode } from "@/lib/tv/pairing";

import { pairRpc, type ConfirmAnswer } from "../pair-server";

const BodySchema = z.strictObject({
  code: z.string().max(32),
  client_request_id: z.guid(),
  /** The kiosk to connect when the company has several; one kiosk is found by itself. */
  screen_id: z.guid().optional(),
});

const STATUS: Record<string, number> = { bad_code: 400, too_many: 429, no_screen: 409, which_screen: 409 };

/**
 * «Подключить экран» (D-182): the director types the six digits from the wall. The function runs
 * under his own token — the role and the company come from the base (`tv_pair_confirm`), the
 * screen becomes his company's kiosk and nobody else's. A typo is refused here before any attempt
 * is spent: the sixth digit is a check, and a code that fails it was never on any wall.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body }) => {
    if (!sameOrigin(req)) return apiError(403, "forbidden", "Нет доступа");

    const read = readPairCode(body.code);
    if (read.state !== "ok") {
      const why = read.state === "typo" ? "typo" : "bad_code";
      return apiError(400, why, confirmError(why));
    }

    const supabase = await userSupabase(req);
    const { data, error } = await pairRpc<ConfirmAnswer>(supabase, "tv_pair_confirm", {
      p_code_hash: hashCode(read.digits),
      p_request_id: body.client_request_id,
      p_screen_id: body.screen_id ?? null,
    });
    if (error) {
      if (error.message === "forbidden") return apiError(403, "forbidden", confirmError("forbidden"));
      console.error("tv_pair_confirm failed:", error.message);
      return apiError(502, "confirm_failed", confirmError("failed"));
    }
    if (!data) return apiError(502, "confirm_failed", confirmError("failed"));
    if (!data.ok) {
      return apiError(STATUS[data.error] ?? 400, data.error, confirmError(data.error, data.retry_after), {
        retry_after: data.retry_after,
      });
    }
    return apiOk({ ok: true, duplicate: data.duplicate, screen: data.screen, device: data.device });
  },
  BodySchema,
);
