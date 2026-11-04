import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env.public";
import type { Database } from "@/lib/supabase/types";

import { opsRpc } from "./db";
import { opsCookieOptions } from "./session";

/**
 * The client of a console request (D-157): the operator's JWT from the console's own cookie, so
 * every `ops_*` read and ticket runs as the operator and the base decides. There is no browser
 * twin: the console's pages talk to `/api/ops/*` only.
 */
export async function createOpsSupabase() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: opsCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

/**
 * The console's layout asks here who is in: a finished sign-in (aal2) of somebody the base still
 * calls an operator. It guards the frame only: every read and ticket is checked by `ops.assert`.
 */
export async function getOperator(): Promise<{ userId: string; email: string } | null> {
  const supabase = await createOpsSupabase();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || claims.aal !== "aal2") return null;

  const state = await opsRpc(supabase, "ops_login_state", {}).catch(() => null);
  return state?.operator ? { userId: claims.sub, email: claims.email ?? "" } : null;
}
