import { redirect } from "next/navigation";

import { LabScreen } from "@/components/lab/LabScreen";
import { AuthError, getSessionProfile } from "@/lib/auth";
import { parseLabTab } from "@/lib/lab/tabs";
import { canManageTeam } from "@/lib/routes";

export default async function LabPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  // the layout renders in parallel and redirects on its own; this only needs the role
  const role = await getSessionProfile().then(
    (p) => p.role,
    (error: unknown) => {
      if (error instanceof AuthError) redirect("/login");
      throw error;
    },
  );
  return <LabScreen tab={parseLabTab((await searchParams).tab)} admin={canManageTeam(role)} />;
}
