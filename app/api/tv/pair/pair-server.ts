import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

/**
 * The server side of «Подключить экран» (D-182), shared by the wall's route and the remote's.
 * Not a route: Next serves only `route.ts` files.
 */

/** The wall's secret: 256 random bits in an httpOnly cookie of the browser that shows the code. */
export const PAIR_COOKIE = "pulse-tv-pair";

/**
 * The cookie outlives the code: a confirmation in the code's last second is still picked up by
 * the next poll (the base allows a pick-up for 30 minutes after the confirmation). Only the
 * pairing routes ever see it; never sent from another site.
 */
export const PAIR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/tv/pair",
  maxAge: 60 * 60,
};

export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * What the base keeps instead of the secret. A plain SHA-256 is enough: 256 random bits cannot
 * be guessed back from it (a 6-digit code can — that one is an HMAC, `hashCode`).
 */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(`tv-pair:${secret}`).digest("hex");
}

type RpcAnswer = { data: unknown; error: { message: string } | null };
type UntypedRpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcAnswer> };

export type PairFn = "tv_pair_issue" | "tv_pair_poll" | "tv_pair_release" | "tv_pair_confirm";

/**
 * The pairing functions of migration 20261118140100. Called by name until `lib/supabase/types.ts`
 * lists them; the answers are read through the types below.
 */
export async function pairRpc<T>(client: SupabaseClient<Database>, fn: PairFn, args: Record<string, unknown>) {
  const { data, error } = await (client as unknown as UntypedRpc).rpc(fn, args);
  return { data: data as T | null, error };
}

export type IssueAnswer =
  | { ok: true; id: string; expires_at: string; expires_in: number }
  | { ok: false; error: "confirmed" | "too_many" | "busy"; retry_after?: number };

export type PollAnswer =
  | { state: "waiting"; id: string; expires_in: number }
  | { state: "expired" | "gone" }
  | { state: "confirmed"; id: string; user_id: string; company_id: string };

export type ConfirmAnswer =
  | { ok: true; duplicate: boolean; screen: string | null; device: string | null }
  | { ok: false; error: "bad_code" | "too_many" | "no_screen" | "which_screen"; retry_after?: number };

/**
 * A session of the kiosk user on THIS browser — the mechanism of the code sign-in (D-135,
 * app/api/auth/code): the admin API generates a magic link (it sends nothing) and its hashed
 * token is verified right here through the cookie client, which writes the session cookies onto
 * the answer. The kiosk user has an email in Auth (a service address on `.invalid` without one).
 */
export async function mintSession(userId: string): Promise<boolean> {
  const service = createServiceSupabase();
  const { data: userData, error: userError } = await service.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (userError || !email) {
    console.error("tv pairing: no auth user/email:", userError?.message ?? "no email");
    return false;
  }

  const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("tv pairing: generateLink failed:", linkError?.message ?? "no hashed_token");
    return false;
  }

  const supabase = await createServerSupabase();
  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verifyError || !verified.session) {
    console.error("tv pairing: verifyOtp failed:", verifyError?.message ?? "no session");
    return false;
  }
  return true;
}
