import "server-only";

import { redirect } from "next/navigation";

import { AuthError, getSessionProfile, type SessionProfile } from "@/lib/auth";

/**
 * The profile a screen renders for. Without a session, or with one the app no longer honours
 * (an inactive person, a closed sign-in, D-135), the sign-in screen; any other failure goes on to
 * the error page.
 */
export async function profileOrLogin(): Promise<SessionProfile> {
  try {
    return await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
}
