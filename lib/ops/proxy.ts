import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env.public";
import type { Database } from "@/lib/supabase/types";

import { hostAllowed, OPS_HEADERS, requestHost } from "./guard";
import { OPS_LOGIN_PATH } from "./paths";
import { opsCookieOptions } from "./session";

function stamp(response: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(OPS_HEADERS)) response.headers.set(name, value);
  return response;
}

/**
 * The proxy's branch for `/ops` (D-157): the console's own session, refreshed under its own
 * cookie, so a company session in the same browser is neither read nor touched. An address
 * without a finished sign-in goes to the console's sign-in, never to `/login`. The sign-in screen
 * itself never redirects away: the layout decides on the base's word, and a redirect here could
 * loop with it for an operator the base no longer accepts.
 *
 * Loaded lazily by proxy.ts: the contract brings lib/settings, and an ordinary path pays nothing.
 */
export async function opsProxy(request: NextRequest): Promise<NextResponse> {
  if (!hostAllowed(process.env.OPS_HOST, requestHost(request.headers))) {
    return stamp(new NextResponse(null, { status: 404 }));
  }

  let response = NextResponse.next({ request });
  const env = getPublicEnv();
  const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: opsCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Nothing between createServerClient and getClaims (@supabase/ssr contract, see proxy.ts).
  const { data } = await supabase.auth.getClaims();

  if (data?.claims.aal !== "aal2" && request.nextUrl.pathname !== OPS_LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = OPS_LOGIN_PATH;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return stamp(redirect);
  }
  return stamp(response);
}
