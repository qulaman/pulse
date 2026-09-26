import { redirect } from "next/navigation";

import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile } from "@/lib/auth";
import { tabBarRole } from "@/lib/routes";

/** Общий экран: магазин открыт любой вошедшей роли, оболочка та же, что у Рейтинга. */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <RoleScope role={tabBarRole(profile.role)} me={profile}>{children}</RoleScope>
      <TabBar role={tabBarRole(profile.role)} />
    </div>
  );
}
