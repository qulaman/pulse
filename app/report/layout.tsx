import { redirect } from "next/navigation";

import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";
import { tabScope } from "@/lib/lab/access";
import { isTeamRole } from "@/lib/routes";

/**
 * «Отчёт за день» (D-152): the team's screen — whoever owes a report (`team_role()`); the
 * director and the kiosk go home. It lives in «Дела» (SECTIONS in TabBar.tsx).
 */
export default async function ReportLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
  if (!isTeamRole(profile.role)) redirect(homeForRole(profile.role));

  const scope = await tabScope(profile);
  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <RoleScope {...scope} me={profile}>{children}</RoleScope>
      <TabBar {...scope} />
    </div>
  );
}
