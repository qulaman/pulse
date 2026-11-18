import "server-only";

import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env.public";
import { homeForRole, type Role } from "@/lib/routes";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export { homeForRole, type Role };

export type SessionProfile = {
  userId: string;
  companyId: string;
  role: Role;
  isActive: boolean;
  fullName: string;
};

export class AuthError extends Error {
  readonly status: 401 | 403;
  readonly code: string;

  constructor(status: 401 | 403, code: string) {
    super(code);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

const MESSAGES_RU: Record<string, string> = {
  unauthorized: "Нужно войти",
  forbidden: "Нет доступа",
  inactive: "Аккаунт отключён",
};

/** User-facing error text (docs/BACKEND.md section 0, rule 4). */
export function authErrorMessageRu(code: string): string {
  return MESSAGES_RU[code] ?? "Нет доступа";
}

function bearerToken(req: Request): string | undefined {
  const header = req.headers.get("authorization");
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
}

/**
 * Supabase client for a bearer token: the token is sent as the request
 * Authorization header, so every query still runs under the user's RLS.
 */
function createTokenSupabase(token: string) {
  const env = getPublicEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

/**
 * Current user profile. Session source: `Authorization: Bearer <access_token>`
 * when `req` carries one (scripts, Telegram, smokes), cookies otherwise.
 * Throws AuthError — every handler starts with this call (docs/BACKEND.md section 1).
 */
export async function getSessionProfile(req?: Request): Promise<SessionProfile> {
  const token = req ? bearerToken(req) : undefined;
  return token ? loadProfile(createTokenSupabase(token), token) : cookieProfile();
}

/**
 * The cookie session once per server render: a layout and its page render side by side and
 * both ask (D-126). React's cache lives for one request only, so nobody else's session is ever
 * reused; a route handler calls it once anyway.
 */
const cookieProfile = cache(async (): Promise<SessionProfile> => loadProfile(await createServerSupabase()));

async function loadProfile(supabase: SupabaseClient<Database>, token?: string): Promise<SessionProfile> {
  // getClaims verifies the JWT signature on this server once the project signs with an asymmetric
  // key (the JWKS is cached per instance) — no Auth round trip per render. Under the legacy
  // symmetric secret it asks the Auth server itself, exactly as getUser did (D-126).
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  const userId = claimsData?.claims.sub;

  if (claimsError || !userId) {
    throw new AuthError(401, "unauthorized");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, company_id, role, is_active, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    throw new AuthError(401, "unauthorized");
  }
  if (!profile.is_active) {
    throw new AuthError(403, "inactive");
  }

  return {
    userId: profile.id,
    companyId: profile.company_id,
    role: profile.role,
    isActive: profile.is_active,
    fullName: profile.full_name,
  };
}

/** Throws 403 unless the profile carries one of the allowed roles. */
export function requireRole(profile: SessionProfile, ...roles: Role[]): void {
  if (!roles.includes(profile.role)) {
    throw new AuthError(403, "forbidden");
  }
}
