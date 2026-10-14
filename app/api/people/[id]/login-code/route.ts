import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import type { SessionProfile } from "@/lib/auth";
import { CODE_TTL_SECONDS, generateCode } from "@/lib/login-code/code";
import { hashCode, signInLink } from "@/lib/login-code/server";
import { canResetLogin } from "@/lib/people/access";
import { createServiceSupabase } from "@/lib/supabase/service";

const BodySchema = z.strictObject({
  client_request_id: z.guid().optional(),
});

type Target = { id: string; role: SessionProfile["role"]; company_id: string; is_active: boolean; full_name: string };

/**
 * Who may hand a sign-in code to whom (D-135 §1): anyone to themselves («Войти на другом
 * устройстве»), the director and the secretary to a person of their company by the rule of
 * the password reset (`canResetLogin`: a director's login is touched only by that director).
 */
type Loaded =
  | { ok: false; error: Response }
  | { ok: true; service: ReturnType<typeof createServiceSupabase>; target: Target; company: { name: string; slug: string | null } };

async function loadTarget(profile: SessionProfile, rawId: string | undefined): Promise<Loaded> {
  const id = z.guid().safeParse(rawId); // guid: seed ids are not RFC-4122
  if (!id.success) return { ok: false, error: apiError(404, "not_found", "Сотрудник не найден") };

  const service = createServiceSupabase();
  const { data: target } = await service
    .from("profiles")
    .select("id, role, company_id, is_active, full_name")
    .eq("id", id.data)
    .maybeSingle<Target>();

  if (!target || target.company_id !== profile.companyId) {
    return { ok: false, error: apiError(404, "not_found", "Сотрудник не найден") };
  }
  const self = target.id === profile.userId;
  const staff = profile.role === "director" || profile.role === "secretary";
  if (!self && !(staff && canResetLogin({ id: profile.userId, role: profile.role }, target))) {
    return { ok: false, error: apiError(403, "forbidden", "Вход директора выдаёт только он сам") };
  }

  const { data: company } = await service.from("companies").select("name, slug").eq("id", target.company_id).maybeSingle();
  return { ok: true, service, target, company: { name: company?.name ?? "", slug: company?.slug ?? null } };
}

const ISSUE_ERRORS: Record<string, [number, string]> = {
  duplicate: [409, "Код уже выдан — он на экране"],
  inactive: [409, "Человек отключён — сначала «Работает в компании», потом код"],
  not_found: [404, "Сотрудник не найден"],
  too_many_codes: [429, "В компании слишком много невведённых кодов — новые через 15 минут"],
};

/**
 * A fresh code (D-135): the previous open one of the person stops working. The code itself
 * is in this answer only — the base keeps an HMAC — so a closed sheet cannot show it again.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  "any",
  async ({ req, profile, body, params }) => {
    const loaded = await loadTarget(profile, params.id);
    if (!loaded.ok) return loaded.error;
    const { service, target, company } = loaded;
    if (!target.is_active) return apiError(ISSUE_ERRORS.inactive[0], "inactive", ISSUE_ERRORS.inactive[1]);

    // eight digits from 10^8: a clash with an open code is rare, a second draw settles it
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { data, error } = await service.rpc("issue_login_code", {
        p_user_id: target.id,
        p_issued_by: profile.userId,
        p_code_hash: hashCode(code),
        p_ttl_seconds: CODE_TTL_SECONDS,
        p_request_id: body?.client_request_id,
      });
      if (error) {
        if (error.message === "collision") continue;
        const known = ISSUE_ERRORS[error.message];
        if (known) return apiError(known[0], error.message, known[1]);
        console.error("issue_login_code failed:", error.message);
        return apiError(502, "issue_failed", "Не получилось выдать код — можно ещё раз");
      }
      const issued = data as { id: string; expires_at: string };
      return apiOk(
        {
          code,
          expires_at: issued.expires_at,
          link: signInLink(req, company.slug),
          company: company.name,
          name: target.full_name,
        },
        201,
      );
    }
    console.error("issue_login_code: five collisions in a row");
    return apiError(502, "issue_failed", "Не получилось выдать код — можно ещё раз");
  },
  BodySchema,
);

export type LoginCodeState = "none" | "open" | "used" | "expired" | "cancelled";

/**
 * The last code of the person, for the sheet that waits for the sign-in and for the card:
 * «ждёт входа до 14:35» → «вошёл с iPhone в 14:23». Never the code — it is not kept.
 */
export const GET = withAuth("any", async ({ req, profile, params }) => {
  const loaded = await loadTarget(profile, params.id);
  if (!loaded.ok) return loaded.error;
  const { service, target, company } = loaded;

  const { data: last } = await service
    .from("login_codes")
    .select("issued_at, expires_at, used_at, cancelled_at, used_device, issued_by")
    .eq("user_id", target.id)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let issuer: string | null = null;
  if (last) {
    const { data } = await service.from("profiles").select("full_name").eq("id", last.issued_by).maybeSingle();
    issuer = data?.full_name ?? null;
  }

  const state: LoginCodeState = !last
    ? "none"
    : last.used_at
      ? "used"
      : last.cancelled_at
        ? "cancelled"
        : new Date(last.expires_at).getTime() <= Date.now()
          ? "expired"
          : "open";

  return apiOk({
    state,
    issued_at: last?.issued_at ?? null,
    expires_at: last?.expires_at ?? null,
    used_at: last?.used_at ?? null,
    device: last?.used_device ?? null,
    issued_by: issuer,
    link: signInLink(req, company.slug),
    company: company.name,
  });
});
