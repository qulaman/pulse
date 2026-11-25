import { redirect } from "next/navigation";

import { RoleScope } from "@/components/RoleScope";
import { homeForRole } from "@/lib/auth";
import { profileOrLogin } from "@/lib/auth-layout";
import { tabScope } from "@/lib/lab/access";

/**
 * «Подключение» (D-190): a screen of its own without the tab bar — a short run of steps the person
 * leaves with «Позже» or «В Ленту». Every signed-in person but the wall: the team gets it once by
 * itself on the first sign-in, the director from «Профиль».
 */
export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const profile = await profileOrLogin();
  if (profile.role === "tv") redirect(homeForRole(profile.role));
  const scope = await tabScope(profile);
  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <RoleScope {...scope} me={profile}>
        {children}
      </RoleScope>
    </div>
  );
}
