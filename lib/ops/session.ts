import { OPS_COOKIE } from "./contract";

/**
 * The cookie of an operator's session (D-157): its own name, so the console and a company session
 * in one browser never touch each other; scripts never read it, other sites never send it.
 * Shared by the route handlers and the proxy; the name also becomes the auth client's storage key.
 */
export function opsCookieOptions() {
  return {
    name: OPS_COOKIE,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}
