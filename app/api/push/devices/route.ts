import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";

/**
 * The director's devices (D-114): where his pushes go, how the last one went, «присылать сюда»
 * per device and «Удалить». An employee has no such list — their channel is the system's
 * business (the team's health, not a switch). Service role, scoped to the caller's own rows.
 */
export const GET = withAuth(["director"], async ({ profile }) => {
  const { data, error } = await createServiceSupabase()
    .from("push_subscriptions")
    .select("id, endpoint, label, enabled, last_ok_at, last_error, last_error_at, created_at")
    .eq("user_id", profile.userId)
    .order("created_at");
  if (error) {
    console.error("devices read failed:", error.message);
    return apiError(502, "devices_failed", "Не удалось загрузить устройства");
  }
  return apiOk({ devices: data ?? [] });
});

const PatchSchema = z.strictObject({ id: z.uuid(), enabled: z.boolean() });

export const PATCH = withAuth<z.infer<typeof PatchSchema>>(
  ["director"],
  async ({ profile, body }) => {
    // setting a switch to a value is the same state however often it is repeated (принцип 7)
    const { data, error } = await createServiceSupabase()
      .from("push_subscriptions")
      .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
      .eq("id", body.id)
      .eq("user_id", profile.userId)
      .select("id")
      .maybeSingle();
    if (error) return apiError(502, "devices_failed", "Не удалось сохранить");
    if (!data) return apiError(404, "not_found", "Устройство не найдено");
    return apiOk({ ok: true });
  },
  PatchSchema,
);

const DeleteSchema = z.strictObject({ id: z.uuid() });

export const DELETE = withAuth<z.infer<typeof DeleteSchema>>(
  ["director"],
  async ({ profile, body }) => {
    await createServiceSupabase().from("push_subscriptions").delete().eq("id", body.id).eq("user_id", profile.userId);
    return apiOk({ ok: true });
  },
  DeleteSchema,
);
