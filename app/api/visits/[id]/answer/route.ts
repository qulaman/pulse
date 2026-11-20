import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk, rpcFailure } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  answer: z.enum(["invited", "wait", "declined", "read"]),
});

/**
 * The director's answer to «К вам посетитель» (D-96): «Пусть заходит» / «Подождёт» /
 * «Не приму»; to the secretary's message on the wall (D-116) — «Понятно» (`read`). An
 * absolute state — the same answer twice is the same visit, so there is no
 * client_request_id (the D-76 §3 exception). The secretary's push leaves at once.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body, params }) => {
    const visitId = params.id;
    if (!z.guid().safeParse(visitId).success) return apiError(404, "visit_not_found", "Посетитель не найден");

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("answer_visit", { p_id: visitId, p_answer: body.answer });
    if (error) {
      if (error.message.includes("forbidden")) return apiError(404, "visit_not_found", "Посетитель не найден");
      // a second answer: the words depend on what was answered
      if (error.message.includes("bad_transition")) {
        return body.answer === "read"
          ? apiError(409, "already_answered", "Секретарь уже убрал это сообщение")
          : apiError(409, "already_answered", "Уже ответили — посетитель ушёл или вошёл");
      }
      return rpcFailure(error, { bad_answer: [400, "Этот ответ сюда не подходит"] }, "answer_visit");
    }
    after(() => kickDeliveries());
    return apiOk({ visit: data });
  },
  BodySchema,
);
