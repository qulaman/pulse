import type { ReactNode } from "react";

import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { profileOrLogin } from "@/lib/auth-layout";
import { tabScope } from "@/lib/lab/access";

/**
 * The phone shell of a screen every signed-in role opens — «Календарь», «Рейтинг», «Магазин»,
 * «Профиль», «Эфир», a task's thread: the page under the role's scope, the role's tab bar below
 * (with «Лаб» while the company tests the product, D-150). No session — the sign-in screen.
 */
export async function TabShell({ children }: { children: ReactNode }) {
  const profile = await profileOrLogin();
  const scope = await tabScope(profile);
  return (
    <div className="flex min-h-dvh flex-col">
      <RoleScope {...scope} me={profile}>{children}</RoleScope>
      <TabBar {...scope} />
    </div>
  );
}
