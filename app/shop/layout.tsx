import { redirect } from "next/navigation";

import { RoleScope } from "@/components/RoleScope";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile } from "@/lib/auth";
import { tabScope } from "@/lib/lab/access";

/** Общий экран: магазин открыт любой вошедшей роли, оболочка та же, что у Рейтинга. */
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
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
