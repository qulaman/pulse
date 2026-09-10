import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { AuthError, getSessionProfile } from "@/lib/auth";

/**
 * The thread is shared by both roles, so it lives outside the (employee) and
 * (director) groups — but it still needs a session of its own.
 */
export default async function TaskThreadLayout({ children }: { children: React.ReactNode }) {
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
    </div>
  );
}
