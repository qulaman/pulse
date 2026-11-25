import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { deviceLabel } from "@/lib/push/device";
import { createServiceSupabase } from "@/lib/supabase/service";

const BodySchema = z.strictObject({
  endpoint: z.url(),
  keys: z.strictObject({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  user_agent: z.string().max(300).optional(),
  /** The endpoint this one replaces (the service worker's `pushsubscriptionchange`). */
  replaces: z.url().optional(),
});

/**
 * Where to push this person (D-114). Called on «Включить», and again on every app start and by
 * the service worker when the browser renews the subscription — so a subscription the push
 * service dropped comes back by itself. The endpoint belongs to the browser: whoever is signed
 * in on it now owns it (a shared phone moves to the new person); the same person re-registering
 * keeps their «присылать сюда» switch. Service role, always scoped to the caller.
 *
 * An endpoint is no secret (the director reads his people's devices), so knowing it is not
 * enough to take it from another person: the browser that holds it also holds its keys, and a
 * shared phone where somebody else signs in sends the very same ones. Another person's row
 * moves only to a caller who brings its keys; anyone else gets 409 and that row stays as it is.
 * The client takes the 409 as any failed subscribe: «Включить» says it did not work, the
 * background sync stays quiet and tries again on the next start — no loop, nothing stuck.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  "any",
  async ({ profile, body }) => {
    const service = createServiceSupabase();
    if (body.replaces && body.replaces !== body.endpoint) {
      await service.from("push_subscriptions").delete().eq("endpoint", body.replaces).eq("user_id", profile.userId);
    }

    const label = deviceLabel(body.user_agent);
    const { data: existing } = await service
      .from("push_subscriptions")
      .select("id, user_id, p256dh, auth")
      .eq("endpoint", body.endpoint)
      .maybeSingle();

    if (existing && existing.user_id === profile.userId) {
      const { error } = await service
        .from("push_subscriptions")
        .update({
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          user_agent: body.user_agent ?? null,
          label,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) {
        console.error("push resubscribe failed:", error.message);
        return apiError(502, "subscribe_failed", "Не удалось сохранить подписку");
      }
      return apiOk({ ok: true });
    }

    if (existing) {
      // another person's browser — the same browser only when it brings the same keys
      if (existing.p256dh !== body.keys.p256dh || existing.auth !== body.keys.auth) {
        return apiError(409, "endpoint_taken", "Это устройство получает уведомления другого человека");
      }
      await service.from("push_subscriptions").delete().eq("id", existing.id);
    }
    const { error } = await service.from("push_subscriptions").insert({
      company_id: profile.companyId,
      user_id: profile.userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: body.user_agent ?? null,
      label,
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

/** This browser stops being this person's (sign-out): its pushes stop coming here. */
export const DELETE = withAuth<z.infer<typeof DeleteSchema>>(
  "any",
  async ({ profile, body }) => {
    await createServiceSupabase()
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", body.endpoint)
      .eq("user_id", profile.userId);
    return apiOk({ ok: true });
  },
  DeleteSchema,
);
