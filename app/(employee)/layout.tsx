import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";
import { isTeamRole, tabBarRole } from "@/lib/routes";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
  // the shop keeper and the kiosk have screens of their own; everybody else in the
  // team shares this shell, the secretary included (D-79)
  if (!isTeamRole(profile.role) || profile.role === "shopkeeper") redirect(homeForRole(profile.role));

  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <AppHeader fullName={profile.fullName} companyId={profile.companyId} />
      {children}
      <TabBar role={tabBarRole(profile.role)} />
    </div>
  );
}
