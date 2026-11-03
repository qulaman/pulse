import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { isDesktopUa, VIEW_COOKIE, wantsPhoneView } from "@/lib/desk/device";
import { deskHomeFor, deskRouteFor, mayHaveDeskRoute } from "@/lib/desk/routes";
import { getPublicEnv } from "@/lib/env.public";
import { canManageTeam, homeForRole } from "@/lib/routes";
import type { Database } from "@/lib/supabase/types";

function isPublicPath(pathname: string): boolean {
  // Component sandboxes need no session; app/dev/layout.tsx 404s them in production.
  if (process.env.NODE_ENV !== "production" && (pathname === "/dev" || pathname.startsWith("/dev/"))) {
    return true;
  }
  return (
    pathname === "/" ||
    isSignInPath(pathname) ||
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

  if (pathname === "/" || isSignInPath(pathname)) {
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
    // a computer goes straight to the desk's home: one hop instead of two (D-153)
    const desk = onDesk(request) && canManageTeam(profile.role);
    return redirectTo(request, response, desk ? deskHomeFor(profile.role) : homeForRole(profile.role));
  }

  // The director and the secretary on a computer work on the desk (D-153): a phone address with a
  // desk twin — a push opened on the computer, a bookmark — moves there. A phone pays nothing: the
  // role is asked only for a desktop browser on such an address.
  if (onDesk(request) && mayHaveDeskRoute(pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    const target = profile ? deskRouteFor(pathname, request.nextUrl.search, profile.role) : null;
    if (target) return redirectTo(request, response, target);
  }

  return response;
}

/** A desktop browser that has not asked for the phone screens («Телефонная версия», D-153). */
function onDesk(request: NextRequest): boolean {
  if (wantsPhoneView(request.cookies.get(VIEW_COOKIE)?.value)) return false;
  return isDesktopUa(request.headers.get("user-agent"), request.headers.get("sec-ch-ua-mobile"));
}

/** The sign-in screen: `/login`, or a company's own address from a QR, `/c/<slug>` (D-135). */
function isSignInPath(pathname: string): boolean {
  return pathname === "/login" || /^\/c\/[^/]+\/?$/.test(pathname);
}

/** Redirect that keeps the refreshed auth cookies of `response`; `target` may carry its own query. */
function redirectTo(request: NextRequest, response: NextResponse, target: string) {
  const url = request.nextUrl.clone();
  const at = target.indexOf("?");
  url.pathname = at < 0 ? target : target.slice(0, at);
  url.search = at < 0 ? "" : target.slice(at);
  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/|.*\\.[\\w]+$).*)"],
};
