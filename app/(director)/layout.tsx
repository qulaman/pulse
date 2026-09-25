import { redirect } from "next/navigation";

import { DirectorShell } from "@/components/DirectorShell";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";

export default async function DirectorLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
  if (profile.role !== "director") redirect(homeForRole(profile.role));

  return (
    <DirectorShell me={profile}>
      {children}
    </DirectorShell>
  );
}
