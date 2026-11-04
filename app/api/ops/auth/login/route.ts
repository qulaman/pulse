import { createClient } from "@supabase/supabase-js";

import { apiError, apiOk } from "@/lib/api/respond";
import { getPublicEnv } from "@/lib/env.public";
import { LoginBodySchema, type LoginAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";
import type { Database } from "@/lib/supabase/types";

/** One answer for a wrong password and for a person who is no operator. 400: a 401 sends the page to sign-in anew. */
function refused(): Response {
  return apiError(400, "invalid_credentials", "Неверная почта или пароль");
}

/**
 * The password step (D-157). The sign-in runs on a client of its own, without cookies: only an
 * operator's session reaches the browser, so nobody learns from a Set-Cookie that the password of
 * a company's person was right. A session opened for a non-operator is closed at once.
 */
export const POST = withOps({ gate: "open", schema: LoginBodySchema }, async ({ db, body }) => {
  const env = getPublicEnv();
  const probe = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await probe.auth.signInWithPassword({ email: body.email, password: body.password });
  if (error || !data.session) return refused();

  const state = await opsRpc(probe, "ops_login_state", {}).catch((failure: unknown) => {
    console.error("ops_login_state failed:", failure instanceof Error ? failure.message : failure);
    return null;
  });
  if (!state?.operator) {
    await probe.auth.signOut({ scope: "local" }).catch(() => undefined);
    return refused();
  }

  const saved = await db.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  if (saved.error) throw new Error(`ops session save failed: ${saved.error.message}`);

  const { data: factors, error: factorsError } = await probe.auth.mfa.listFactors();
  if (factorsError) throw new Error(`ops factors read failed: ${factorsError.message}`);
  return apiOk({ next: factors.totp.length > 0 ? "verify" : "enroll" } satisfies LoginAnswer);
});
