import { redirect } from "next/navigation";

import { AuthError, getSessionProfile } from "@/lib/auth";

import { TeamScreen } from "./TeamScreen";

/**
 * «Команда» is the director's load board. The secretary runs the roster in «Настройки» →
 * «Сотрудники» instead (D-104): she sees no one's tasks, so a load board would lie to her.
 */
export default async function PeoplePage() {
  // the layout renders in parallel and redirects on its own; this only needs the role
  const role = await getSessionProfile().then(
    (p) => p.role,
    (error: unknown) => {
      if (error instanceof AuthError) redirect("/login");
      throw error;
    },
  );
  if (role !== "director") redirect("/settings?tab=team");
  return <TeamScreen />;
}
