import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";

const BodySchema = z.strictObject({
  /** «Выйти на других устройствах»: the phone that asks keeps its session and its pushes. */
  keep_current: z.boolean().optional(),
  keep_endpoint: z.string().url().max(2048).optional(),
});

const ERRORS: Record<string, [number, string]> = {
  forbidden: [403, "Вход директора закрывает только он сам"],
  not_found: [404, "Сотрудник не найден"],
};

/**
 * «Выйти со всех устройств» (D-135): every session of the person is deleted — their phones
 * fall to the sign-in screen at once — push subscriptions removed, open codes cancelled. The
 * RPC runs under the caller's identity and decides who may: the person themselves; the
 * director and the secretary for a person of their company by the rule of the password reset.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  "any",
  async ({ req, body, params }) => {
    const id = z.guid().safeParse(params.id); // guid: seed ids are not RFC-4122
    if (!id.success) return apiError(404, "not_found", "Сотрудник не найден");

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("revoke_sessions", {
      p_user_id: id.data,
      p_keep_current: body?.keep_current ?? false,
      p_keep_endpoint: body?.keep_endpoint,
    });
    if (error) {
      const known = ERRORS[error.message];
      if (known) return apiError(known[0], error.message, known[1]);
      console.error("revoke_sessions failed:", error.message);
      return apiError(502, "revoke_failed", "Не получилось закрыть вход — можно ещё раз");
    }
    return apiOk(data as { sessions: number; devices: number });
  },
  BodySchema,
);
