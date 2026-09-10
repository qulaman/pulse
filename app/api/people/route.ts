import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";

const BodySchema = z.strictObject({
  email: z.email(),
  password: z.string().min(6).max(72),
  full_name: z.string().trim().min(2).max(120),
  role: z.enum(["director", "manager", "employee", "shopkeeper", "tv"]),
  position: z.string().trim().max(120).optional(),
  aliases: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  manager_id: z.guid().nullable().optional(), // guid: seed ids are not RFC-4122
});

/**
 * Director creates a login + profile in one go. Auth user via the admin API (service role),
 * profile insert right after; if the profile fails, the auth user is removed again so a
 * retry with the same email does not hit "already registered".
 * The QR-invite + PIN flow of D-06 replaces the password field in the onboarding order.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ profile, body }) => {
    const service = createServiceSupabase();

    const created = await service.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name },
    });
    if (created.error || !created.data.user) {
      const message = created.error?.message ?? "";
      if (/already|exists|registered/i.test(message)) {
        return apiError(409, "email_exists", "Такая почта уже зарегистрирована");
      }
      console.error("createUser failed:", message);
      return apiError(502, "auth_failed", "Не удалось создать вход, попробуй ещё раз");
    }

    const userId = created.data.user.id;
    const inserted = await service.from("profiles").insert({
      id: userId,
      company_id: profile.companyId,
      full_name: body.full_name,
      role: body.role,
      position: body.position ?? null,
      aliases: body.aliases ?? [],
      manager_id: body.manager_id ?? null,
    });

    if (inserted.error) {
      await service.auth.admin.deleteUser(userId).catch(() => undefined);
      console.error("profile insert failed:", inserted.error.message);
      return apiError(502, "profile_failed", "Не удалось создать профиль, попробуй ещё раз");
    }

    return apiOk({ id: userId }, 201);
  },
  BodySchema,
);
