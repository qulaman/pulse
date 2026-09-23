import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile } from "@/lib/auth";
import { tabBarRole } from "@/lib/routes";

/** Any signed-in profile: the lab has no role check while the model comparison runs (D-63). */
export default async function LabLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader fullName={profile.fullName} companyId={profile.companyId} />
      {children}
      <TabBar role={tabBarRole(profile.role)} />
    </div>
  );
}
