import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DirectorShell } from "@/components/DirectorShell";
import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";
import { canManageTeam } from "@/lib/routes";

/**
 * Layout of the routes the director shares with the secretary — «Настройки» and «Команда»
 * (D-104). The director keeps the full chrome of the (director) group; the secretary gets
 * her own tab bar with «Настройки» in it; everyone else goes home.
 */
export async function AdminShell({ children }: { children: ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
  if (!canManageTeam(profile.role)) redirect(homeForRole(profile.role));

  if (profile.role === "director") {
    return (
      <DirectorShell me={profile}>
        {children}
      </DirectorShell>
    );
  }

  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <RoleScope role="secretary" me={profile}>{children}</RoleScope>
      <TabBar role="secretary" />
    </div>
  );
}
