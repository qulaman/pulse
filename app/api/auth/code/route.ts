import { z } from "zod";

import { apiError, apiOk } from "@/lib/api/respond";
import { loadBrand } from "@/lib/brand";
import { deviceLabel, normalizeCode } from "@/lib/login-code/code";
import { hashAddress, hashCode, sameOrigin } from "@/lib/login-code/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";

const BodySchema = z.strictObject({
  code: z.string().max(32),
  client_request_id: z.guid(),
  /** A random id this browser keeps (lib/login-code/device.ts): the per-device limit. */
  device: z.string().max(64).optional(),
});

const BAD_CODE = "Код не подходит или устарел — нужен новый";
const FAILED = "Не получилось войти — можно ещё раз";

type Redeemed = { ok: true; code_id: string; user_id: string; company_id: string } | { ok: false; error: string };

/**
 * Sign-in by a one-time code (D-135) — the one route that runs without a session. The base
 * takes the code and counts the attempt (`redeem_login_code`: limits per address, device and
 * the whole base); then the server mints the person's Supabase session itself — a magic link
 * generated and verified here, no email leaves — and sets the cookies on this answer. A
 * session that could not be minted gives the code back, so the person just tries again.
 * One message for a wrong, an expired and a used code: the answer tells a guesser nothing.
 */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return apiError(403, "forbidden", "Нет доступа");

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return apiError(400, "validation_error", "Неверный запрос");
    }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return apiError(400, "validation_error", "Неверный запрос");
    const digits = normalizeCode(parsed.data.code);
    if (!digits) return apiError(400, "bad_code", BAD_CODE);

    const service = createServiceSupabase();
    const { data, error } = await service.rpc("redeem_login_code", {
      p_code_hash: hashCode(digits),
      p_ip_hash: hashAddress(req),
      p_device: parsed.data.device,
      p_request_id: parsed.data.client_request_id,
      p_used_device: deviceLabel(req.headers.get("user-agent")),
    });
    if (error) {
      console.error("redeem_login_code failed:", error.message);
      return apiError(502, "redeem_failed", FAILED);
    }

    const result = data as Redeemed;
    if (!result.ok) {
      if (result.error === "too_many") {
        return apiError(429, "too_many", "Слишком много попыток — вход снова откроется через 15 минут");
      }
      return apiError(400, "bad_code", BAD_CODE);
    }

    if (!(await mintSession(result.user_id))) {
      const released = await service.rpc("release_login_code", { p_code_id: result.code_id });
      if (released.error) console.error("release_login_code failed:", released.error.message);
      return apiError(502, "session_failed", FAILED);
    }

    // the screen plays «из продукта — в свою компанию» with this before it opens the app
    const brand = await loadBrand(result.company_id);
    return apiOk({ ok: true, brand: { name: brand.name, logoUrl: brand.logoUrl, accent: brand.accent } });
  } catch (error) {
    console.error("code sign-in failed:", error instanceof Error ? error.message : error);
    return apiError(500, "internal", FAILED);
  }
}

/**
 * The person's session on this browser: the admin API generates a magic link (it sends
 * nothing) and its hashed token is verified right here through the cookie client, which
 * writes the session cookies onto the answer. Everyone has an email in Auth — a person
 * without one carries a service address on `.invalid` (lib/people/email.ts).
 */
async function mintSession(userId: string): Promise<boolean> {
  const service = createServiceSupabase();
  const { data: userData, error: userError } = await service.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (userError || !email) {
    console.error("code sign-in: no auth user/email:", userError?.message ?? "no email");
    return false;
  }

  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("code sign-in: generateLink failed:", linkError?.message ?? "no hashed_token");
    return false;
  }

  const supabase = await createServerSupabase();
  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verifyError || !verified.session) {
    console.error("code sign-in: verifyOtp failed:", verifyError?.message ?? "no session");
    return false;
  }
  return true;
}
