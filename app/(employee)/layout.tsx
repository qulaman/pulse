import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { TabBar } from "@/components/TabBar";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
  if (profile.role !== "employee" && profile.role !== "manager") redirect(homeForRole(profile.role));

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader fullName={profile.fullName} />
      {children}
      <TabBar role="employee" />
    </div>
  );
}
