import { after } from "next/server";
import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";
import { canManageTeam } from "@/lib/routes";
import { createServiceSupabase } from "@/lib/supabase/service";

const BodySchema = z.strictObject({
  client_request_id: z.uuid(),
  /** Somebody else's phone — only the people who run the team (D-104) may ring it. */
  user_id: z.guid().optional(),
});

/**
 * «Проверить уведомления» (D-114): one push to one's own phones — or, for the director and the
 * secretary, to a person of the team — and its fate read back (GET) until the phone shows it.
 * The row goes through the same outbox and worker as everything else; nothing is simulated.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  "any",
  async ({ profile, body }) => {
    const target = body.user_id ?? profile.userId;
    const other = target !== profile.userId;
    if (other && !canManageTeam(profile.role)) return apiError(403, "forbidden", "Нет доступа");

    const service = createServiceSupabase();
    if (other) {
      const { data: person } = await service
        .from("profiles")
        .select("id")
        .eq("id", target)
        .eq("company_id", profile.companyId)
        .eq("is_active", true)
        .maybeSingle();
      if (!person) return apiError(404, "not_found", "Сотрудник не найден");
    }

    // a repeated tap with the same request id is the same test
    const { data: same } = await service
      .from("notification_deliveries")
      .select("id")
      .eq("user_id", target)
      .eq("event_kind", "test")
      .eq("meta->>crid", body.client_request_id)
      .maybeSingle();
    if (same) return apiOk({ id: same.id, duplicate: true });

    const { data, error } = await service
      .from("notification_deliveries")
      .insert({
        company_id: profile.companyId,
        user_id: target,
        event_kind: "test",
        meta: {
          title: "Проверка связи",
          body: other ? "Проверяем, доходят ли уведомления. Ничего делать не нужно" : "Уведомления работают",
          url: "/profile",
          tag: "push-test",
          crid: body.client_request_id,
        },
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("push test failed:", error?.message);
      return apiError(502, "test_failed", "Не получилось отправить проверку");
    }
    after(() => kickDeliveries());
    return apiOk({ id: data.id }, 201);
  },
  BodySchema,
);

/** The test's fate: queued → sent → seen (the phone showed it) or failed with a reason. */
export const GET = withAuth("any", async ({ req, profile }) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!z.uuid().safeParse(id).success) return apiError(400, "validation_error", "Неверный запрос");
  const { data } = await createServiceSupabase()
    .from("notification_deliveries")
    .select("user_id, company_id, status, sent_at, seen_at, last_error")
    .eq("id", id)
    .eq("event_kind", "test")
    .maybeSingle();
  if (!data || data.company_id !== profile.companyId) return apiError(404, "not_found", "Проверка не найдена");
  if (data.user_id !== profile.userId && !canManageTeam(profile.role)) return apiError(404, "not_found", "Проверка не найдена");
  return apiOk({ status: data.status, sent_at: data.sent_at, seen_at: data.seen_at, last_error: data.last_error });
});
