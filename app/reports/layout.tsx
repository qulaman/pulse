import { redirect } from "next/navigation";

import { DirectorShell } from "@/components/DirectorShell";
import { homeForRole } from "@/lib/auth";
import { profileOrLogin } from "@/lib/auth-layout";

/** «Отчёты» (D-152): the director's screen, entered from «Настройки» — the chrome of the (director) group. */
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const profile = await profileOrLogin();
  if (profile.role !== "director") redirect(homeForRole(profile.role));

  return <DirectorShell me={profile}>{children}</DirectorShell>;
}
