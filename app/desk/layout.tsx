import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DeskShell } from "@/components/desk/DeskShell";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";
import { loadBrand } from "@/lib/brand";
import { NAV_COOKIE, navFoldedFromCookie } from "@/lib/desk/frame";
import { isDeskRole } from "@/lib/desk/routes";
import { canManageTeam } from "@/lib/routes";

import "./journal.css";

export const metadata: Metadata = { title: "Pulse" };

/**
 * The desk (D-153): the director's and the secretary's working surface on a computer, a shell of
 * its own like the wall's (`app/tv/layout.tsx`). Everyone else goes home; the screens below are
 * client pages over the same hooks as the phone.
 */
export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
  if (!canManageTeam(profile.role) || !isDeskRole(profile.role)) redirect(homeForRole(profile.role));
  // the client's logo and the points switch, from the company row the root layout has read (D-126)
  const { name, logoUrl, pointsEnabled } = await loadBrand(profile.companyId);
  // the navigation as this browser left it — folded to icons or wide (D-154 wave 3)
  const navFolded = navFoldedFromCookie((await cookies()).get(NAV_COOKIE)?.value);

  return (
    <DeskShell me={profile} role={profile.role} brand={{ name, logoUrl, pointsEnabled }} navFolded={navFolded}>
      {children}
    </DeskShell>
  );
}
