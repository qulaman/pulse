import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DirectorShell } from "@/components/DirectorShell";
import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { homeForRole } from "@/lib/auth";
import { profileOrLogin } from "@/lib/auth-layout";
import { tabScope } from "@/lib/lab/access";
import { canManageTeam } from "@/lib/routes";

/**
 * Layout of the routes the director shares with the secretary — «Настройки» and «Команда»
 * (D-104). The director keeps the full chrome of the (director) group; the secretary gets
 * her own tab bar; everyone else goes home.
 */
export async function AdminShell({ children }: { children: ReactNode }) {
  const profile = await profileOrLogin();
  if (!canManageTeam(profile.role)) redirect(homeForRole(profile.role));

  if (profile.role === "director") {
    return (
      <DirectorShell me={profile}>
        {children}
      </DirectorShell>
    );
  }

  // the secretary's own bar, with «Отчёты» while the company has the reports on (D-219)
  const scope = await tabScope(profile);
  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <RoleScope {...scope} me={profile}>{children}</RoleScope>
      <TabBar {...scope} />
    </div>
  );
}
