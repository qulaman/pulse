import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";
import { isTeamRole, tabBarRole } from "@/lib/routes";
import { createServerSupabase } from "@/lib/supabase/server";

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
  // the points under the name are behind the same switch as the points themselves (D-48);
  // read here, so the line is in the first paint or not there at all
  const supabase = await createServerSupabase();
  const company = await supabase.from("companies").select("settings").limit(1).maybeSingle();
  const pointsEnabled = (company.data?.settings as { points_enabled?: boolean } | null)?.points_enabled === true;

  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <AppHeader fullName={profile.fullName} companyId={profile.companyId} pointsFor={pointsEnabled ? profile.userId : undefined} />
      {children}
      <TabBar role={tabBarRole(profile.role)} />
    </div>
  );
}
