import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { TabBar } from "@/components/TabBar";
import { DirectorFab } from "@/components/voice/DirectorFab";
import { AuthError, getSessionProfile } from "@/lib/auth";

/**
 * The thread is shared by both roles, so it lives outside the (employee) and
 * (director) groups — but it still needs a session of its own. It keeps the full
 * shell of the role (tab bar, the director's FAB): opening a card from a list and
 * going back must not repaint the chrome.
 */
export default async function TaskThreadLayout({ children }: { children: React.ReactNode }) {
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
      <TabBar role={profile.role === "director" ? "director" : "employee"} />
      {profile.role === "director" ? <DirectorFab /> : null}
    </div>
  );
}
