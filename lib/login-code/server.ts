import "server-only";

import { createHmac } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

import { CODE_TTL_SECONDS, generateCode } from "./code";

/**
 * The key the code and address hashes are made with: `LOGIN_CODE_SECRET` when set, otherwise
 * derived from the service-role key — server-only already, so a fresh deployment works without
 * one more secret. Rotating either only voids codes that live 15 minutes anyway.
 */
function key(): string {
  const own = process.env.LOGIN_CODE_SECRET;
  if (own) return own;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) throw new Error("login code key is missing (LOGIN_CODE_SECRET / SUPABASE_SERVICE_ROLE_KEY)");
  return `login-code:${service}`;
}

function hmac(kind: string, value: string): string {
  return createHmac("sha256", key()).update(`${kind}:${value}`).digest("hex");
}

/** What the base keeps instead of the code (D-135 §3). */
export function hashCode(digits: string): string {
  return hmac("code", digits);
}

/** The caller's address for the limits, hashed: the base never holds an IP. */
export function hashAddress(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  return hmac("ip", ip).slice(0, 32);
}

/**
 * A browser POST from another site carries its own Origin: refuse it, so no page elsewhere
 * signs this browser into somebody's account. Scripts without an Origin pass.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** A code that was issued — the digits leave once, the base keeps only their hash — or the base's refusal. */
export type IssueOutcome =
  | { ok: true; code: string; expires_at: string }
  | { ok: false; message: string; sqlstate: string | null };

/**
 * A new sign-in code (D-135) under the service role. Eight digits from 10^8: a clash with an open
 * code is rare, a further draw settles it — five draws at most, then `issue_failed`. `issuedBy`
 * null — the console issued it, its journal says who (D-157). A refusal is the base's word.
 */
export async function issueLoginCode(
  service: SupabaseClient<Database>,
  input: { userId: string; issuedBy: string | null; requestId?: string },
): Promise<IssueOutcome> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data, error } = await service.rpc("issue_login_code", {
      p_user_id: input.userId,
      // null for the console: the generated Args cannot say a SQL argument may be null
      p_issued_by: input.issuedBy as string,
      p_code_hash: hashCode(code),
      p_ttl_seconds: CODE_TTL_SECONDS,
      p_request_id: input.requestId,
    });
    if (!error) return { ok: true, code, expires_at: (data as { expires_at: string }).expires_at };
    if (error.message !== "collision") return { ok: false, message: error.message, sqlstate: error.code ?? null };
  }
  console.error("issue_login_code: five collisions in a row");
  return { ok: false, message: "issue_failed", sqlstate: null };
}

/** The address a QR and a message point to: the company's sign-in screen when it has a slug. */
export function signInLink(req: Request, slug: string | null): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost ? `${proto}://${forwardedHost}` : new URL(req.url).origin;
  return slug ? `${origin}/c/${slug}` : `${origin}/login`;
}
