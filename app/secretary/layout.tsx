import { redirect } from "next/navigation";

import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { profileOrLogin } from "@/lib/auth-layout";
import { tabScope } from "@/lib/lab/access";
import { homeForRole } from "@/lib/routes";

/**
 * The director's errands for the secretary (D-79). One route for both roles, like the shop
 * (D-71); the kiosk and everyone else go home — RLS would give them nothing anyway, and there is
 * no screen to show. No tab of its own: it opens from the ball's panel and from the settings.
 */
export default async function SecretaryLayout({ children }: { children: React.ReactNode }) {
  const profile = await profileOrLogin();
  if (profile.role !== "director" && profile.role !== "secretary") redirect(homeForRole(profile.role));

  // the role's bar as every other layout draws it — the secretary's carries «Отчёты» (D-219)
  const scope = await tabScope(profile);
  return (
    <div className="flex min-h-dvh flex-col">
      <RoleScope {...scope} me={profile}>{children}</RoleScope>
      <TabBar {...scope} />
    </div>
  );
}
