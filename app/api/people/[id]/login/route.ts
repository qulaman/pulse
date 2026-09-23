import { z } from "zod";

import { withAuth, type HandlerContext } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { canResetLogin } from "@/lib/people/access";
import type { Role } from "@/lib/routes";
import { createServiceSupabase } from "@/lib/supabase/service";

const PatchSchema = z.strictObject({
  email: z.email().max(254),
});

type Target = { id: string; role: Role };

/**
 * The person's row when the caller may manage their login: same company and
 * `canResetLogin` (D-104). Anything else answers «не найден» / 403, never the email.
 */
async function loadTarget<T>({ profile, params }: HandlerContext<T>): Promise<Target | Response> {
  const id = z.guid().safeParse(params.id); // guid: seed ids are not RFC-4122
  if (!id.success) return apiError(404, "not_found", "Сотрудник не найден");

  const { data: target } = await createServiceSupabase()
    .from("profiles")
    .select("id, role, company_id")
    .eq("id", id.data)
    .maybeSingle();
  if (!target || target.company_id !== profile.companyId) {
    return apiError(404, "not_found", "Сотрудник не найден");
  }
  if (!canResetLogin({ id: profile.userId, role: profile.role }, target)) {
    return apiError(403, "forbidden", "Вход директора меняет только он сам");
  }
  return target;
}

/**
 * The login behind a card (D-104): the email a person signs in with and when they last
 * did — «ни разу не входил» tells the director the first password never reached them.
 * The email lives in auth.users, so this is a service-role read after the checks above.
 */
export const GET = withAuth(["director", "secretary"], async (ctx) => {
  const target = await loadTarget(ctx);
  if (target instanceof Response) return target;

  const { data, error } = await createServiceSupabase().auth.admin.getUserById(target.id);
  if (error || !data.user) {
    console.error("getUserById failed:", error?.message);
    return apiError(502, "auth_failed", "Не удалось прочитать вход, попробуй ещё раз");
  }
  return apiOk({ email: data.user.email ?? null, last_sign_in_at: data.user.last_sign_in_at ?? null });
});

/** A wrong email at creation is fixed here instead of a second account. */
export const PATCH = withAuth<z.infer<typeof PatchSchema>>(
  ["director", "secretary"],
  async (ctx) => {
    const target = await loadTarget(ctx);
    if (target instanceof Response) return target;

    const email = ctx.body.email.trim().toLowerCase();
    const updated = await createServiceSupabase().auth.admin.updateUserById(target.id, { email, email_confirm: true });
    if (updated.error) {
      const message = updated.error.message ?? "";
      if (/already|exists|registered/i.test(message)) {
        return apiError(409, "email_exists", "Такая почта уже у другого сотрудника");
      }
      console.error("updateUserById(email) failed:", message);
      return apiError(502, "auth_failed", "Не удалось сменить почту, попробуй ещё раз");
    }
    return apiOk({ email: updated.data.user?.email ?? email });
  },
  PatchSchema,
);
