import { redirect } from "next/navigation";

import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile } from "@/lib/auth";
import { tabBarRole } from "@/lib/routes";

/** Shared screen: any signed-in role (docs/FRONTEND.md routing table). */
export default async function EtherLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <RoleScope role={tabBarRole(profile.role)}>{children}</RoleScope>
      <TabBar role={tabBarRole(profile.role)} />
    </div>
  );
}
