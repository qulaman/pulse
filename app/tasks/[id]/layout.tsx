import { redirect } from "next/navigation";

import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile } from "@/lib/auth";
import { tabScope } from "@/lib/lab/access";

/**
 * The thread is shared by both roles, so it lives outside the (employee) and
 * (director) groups — but it still needs a session of its own. It keeps the tab
 * bar of the role: opening a card from a list and
 * going back must not repaint the chrome. The FAB steps aside here, as on /confirm:
 * the thread has its own composer at the bottom.
 */
export default async function TaskThreadLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  const scope = await tabScope(profile);
  return (
    <div className="flex min-h-dvh flex-col">
      <RoleScope {...scope} me={profile}>{children}</RoleScope>
      <TabBar {...scope} />
    </div>
  );
}
