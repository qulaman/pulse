import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";
import { canManageTeam, tabBarRole } from "@/lib/routes";

/** The lab (D-63): the director and the secretary, the people who run the instance; everyone else goes home. */
export default async function LabLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
  if (!canManageTeam(profile.role)) redirect(homeForRole(profile.role));

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader fullName={profile.fullName} companyId={profile.companyId} />
      {children}
      <TabBar role={tabBarRole(profile.role)} />
    </div>
  );
}
