import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env.public";
import { homeForRole } from "@/lib/routes";
import type { Database } from "@/lib/supabase/types";

function isPublicPath(pathname: string): boolean {
  // Component sandboxes need no session; app/dev/layout.tsx 404s them in production.
  if (process.env.NODE_ENV !== "production" && (pathname === "/dev" || pathname.startsWith("/dev/"))) {
    return true;
  }
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".")
  );
}

/**
 * Next 16 proxy (former middleware.ts): refreshes the Supabase session cookie
 * and routes by role. Role guards themselves live in the group layouts —
 * docs/FRONTEND.md "Навигация и роутинг".
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getPublicEnv();
  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
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
    },
  );

  // Do not run code between createServerClient and getClaims: it would break
  // session refresh and log users out at random (@supabase/ssr contract).
  // getClaims refreshes an expiring session like getUser did, then verifies the JWT here once
  // the project signs with an asymmetric key — every navigation and every tab-bar prefetch used
  // to pay an Auth round trip for it (D-126).
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  const { pathname } = request.nextUrl;

  if (!userId) {
    if (isPublicPath(pathname)) return response;
    return redirectTo(request, response, "/login");
  }

  if (pathname === "/" || pathname === "/login") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    // An auth user without a profile (not onboarded yet) stays on /login instead of
    // bouncing between /login -> home -> layout guard -> /login forever.
    if (!profile) {
      return pathname === "/login" ? response : redirectTo(request, response, "/login");
    }
    return redirectTo(request, response, homeForRole(profile.role));
  }

  return response;
}

/** Redirect that keeps the refreshed auth cookies of `response`. */
function redirectTo(request: NextRequest, response: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/|.*\\.[\\w]+$).*)"],
};
