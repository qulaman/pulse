import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";
import { loadBrand } from "@/lib/brand";
import { isTeamRole, tabBarRole } from "@/lib/routes";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  // the company row goes out beside the session check, and the header below reads the same
  // cached promise (D-126); loadBrand never throws
  const brand = loadBrand();
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
  // the points under the name are behind the same switch as the points themselves (D-48);
  // read here, so the line is in the first paint or not there at all
  const { pointsEnabled } = await brand;

  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <AppHeader fullName={profile.fullName} companyId={profile.companyId} pointsFor={pointsEnabled ? profile.userId : undefined} />
      <RoleScope role={tabBarRole(profile.role)} me={profile}>{children}</RoleScope>
      <TabBar role={tabBarRole(profile.role)} />
    </div>
  );
}
