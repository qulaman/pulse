import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { TabBar } from "@/components/TabBar";
import { DirectorFab } from "@/components/voice/DirectorFab";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";

export default async function DirectorLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
  if (profile.role !== "director") redirect(homeForRole(profile.role));

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader fullName={profile.fullName} />
      {children}
      <TabBar role="director" />
      <DirectorFab />
    </div>
  );
}
