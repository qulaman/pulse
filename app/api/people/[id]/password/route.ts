import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { canResetLogin } from "@/lib/people/access";
import { createServiceSupabase } from "@/lib/supabase/service";

const BodySchema = z.strictObject({
  password: z.string().min(6).max(72),
});

/**
 * Director or secretary (D-104) sets a new password for a person of the company (forgot
 * it, phone lost). Service role is needed for the admin API; the target is checked against
 * the caller's own company first, and a director's login is touched only by that director
 * (`canResetLogin`). Handed over in person or by a message — until the QR+PIN of D-06.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director", "secretary"],
  async ({ profile, body, params }) => {
    const id = z.guid().safeParse(params.id); // guid: seed ids are not RFC-4122
    if (!id.success) return apiError(404, "not_found", "Сотрудник не найден");

    const service = createServiceSupabase();
    const { data: target } = await service
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", id.data)
      .maybeSingle();

    if (!target || target.company_id !== profile.companyId) {
      return apiError(404, "not_found", "Сотрудник не найден");
    }
    if (!canResetLogin({ id: profile.userId, role: profile.role }, target)) {
      return apiError(403, "forbidden", "Пароль директора меняет только он сам");
    }

    const updated = await service.auth.admin.updateUserById(target.id, { password: body.password });
    if (updated.error) {
      console.error("updateUserById failed:", updated.error.message);
      return apiError(502, "auth_failed", "Не удалось сменить пароль, попробуй ещё раз");
    }

    return apiOk({ id: target.id });
  },
  BodySchema,
);
