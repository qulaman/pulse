import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";
import { loadBrand } from "@/lib/brand";
import { tabScope } from "@/lib/lab/access";
import { isTeamRole } from "@/lib/routes";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
  // the whole team shares this shell — the secretary (D-79) and the shop keeper (D-146)
  // included: a task can go to any of them; the kiosk has a screen of its own
  if (!isTeamRole(profile.role)) redirect(homeForRole(profile.role));
  // the points under the name are behind the same switch as the points themselves (D-48);
  // read here, so the line is in the first paint or not there at all — the viewer's own
  // company's switch (D-134); the root layout read the same row for this request already
  const { pointsEnabled } = await loadBrand(profile.companyId);
  // «Лаб» on the bar while the company tests (D-150): from the same cached company row
  const scope = await tabScope(profile);
  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <AppHeader fullName={profile.fullName} companyId={profile.companyId} pointsFor={pointsEnabled ? profile.userId : undefined} />
      <RoleScope {...scope} me={profile}>{children}</RoleScope>
      <TabBar {...scope} />
    </div>
  );
}
