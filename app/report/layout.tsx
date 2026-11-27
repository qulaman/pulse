import { redirect } from "next/navigation";

import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { homeForRole } from "@/lib/auth";
import { profileOrLogin } from "@/lib/auth-layout";
import { tabScope } from "@/lib/lab/access";
import { isTeamRole } from "@/lib/routes";

/**
 * «Отчёт за день» (D-152): the team's screen — whoever owes a report (`team_role()`); the
 * director and the kiosk go home. It is the tab «Отчёты» of the team's bar while the company has
 * the reports on (D-219, `tabsOf` in TabBar.tsx); with them off it opens from «Профиль».
 */
export default async function ReportLayout({ children }: { children: React.ReactNode }) {
  const profile = await profileOrLogin();
  if (!isTeamRole(profile.role)) redirect(homeForRole(profile.role));

  const scope = await tabScope(profile);
  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <RoleScope {...scope} me={profile}>{children}</RoleScope>
      <TabBar {...scope} />
    </div>
  );
}
