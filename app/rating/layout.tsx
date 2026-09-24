import { redirect } from "next/navigation";

import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile } from "@/lib/auth";
import { tabBarRole } from "@/lib/routes";

/** Shared screen: any signed-in role, same shell as Эфир. */
export default async function RatingLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {children}
      <TabBar role={tabBarRole(profile.role)} />
    </div>
  );
}
