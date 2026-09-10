import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";

const BodySchema = z.strictObject({
  endpoint: z.url(),
  keys: z.strictObject({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  user_agent: z.string().max(300).optional(),
});

/** The browser allowed notifications: remember where to push. Own row under RLS. */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  "any",
  async ({ req, profile, body }) => {
    const supabase = await userSupabase(req);
    // the endpoint is unique: a re-subscribe of the same browser replaces the keys
    await supabase.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
    const { error } = await supabase.from("push_subscriptions").insert({
      company_id: profile.companyId,
      user_id: profile.userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: body.user_agent ?? null,
    });
    if (error) {
      console.error("push subscribe failed:", error.message);
      return apiError(502, "subscribe_failed", "Не удалось сохранить подписку");
    }
    return apiOk({ ok: true }, 201);
  },
  BodySchema,
);

const DeleteSchema = z.strictObject({ endpoint: z.url() });

export const DELETE = withAuth<z.infer<typeof DeleteSchema>>(
  "any",
  async ({ req, body }) => {
    const supabase = await userSupabase(req);
    await supabase.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
    return apiOk({ ok: true });
  },
  DeleteSchema,
);
