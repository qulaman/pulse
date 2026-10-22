import { redirect } from "next/navigation";

import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";
import { labOpen, tabScope } from "@/lib/lab/access";

/**
 * The lab (D-63): the director and the secretary, the people who run the instance; the rest
 * of the team too while the company tests the product (D-150) — everyone else goes home.
 */
export default async function LabLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
  if (!(await labOpen(profile))) redirect(homeForRole(profile.role));

  const scope = await tabScope(profile);
  return (
    <div className="flex min-h-dvh flex-col">
      <RoleScope {...scope} me={profile}>{children}</RoleScope>
      <TabBar {...scope} />
    </div>
  );
}
