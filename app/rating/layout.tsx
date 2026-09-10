import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile } from "@/lib/auth";

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
      <AppHeader fullName={profile.fullName} />
      {children}
      <TabBar role={profile.role === "director" ? "director" : "employee"} />
    </div>
  );
}
