import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile } from "@/lib/auth";
import { homeForRole } from "@/lib/routes";

/**
 * Заявки директора секретарю (D-79). Один маршрут на две роли, как у магазина (D-71);
 * киоск и остальные сюда не ходят — RLS всё равно ничего им не отдаст, но и экрана
 * показывать незачем. Вкладки в таб-баре нет: вход из панели шарика и из настроек.
 */
export default async function SecretaryLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
  if (profile.role !== "director" && profile.role !== "secretary") redirect(homeForRole(profile.role));

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader fullName={profile.fullName} companyId={profile.companyId} />
      {children}
      <TabBar role={profile.role === "director" ? "director" : "employee"} />
    </div>
  );
}
