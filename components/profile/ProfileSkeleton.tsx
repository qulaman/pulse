"use client";

import { ProfileCard } from "@/components/profile/ProfileCard";
import { useTabRole } from "@/components/RoleScope";
import { PageHead } from "@/components/ui/PageHead";

/**
 * «Профиль» before the server has drawn it: the head and the identity card itself, grey
 * (`pending`), with the numbers of the role the layout already knows — a director's labels
 * take two lines, an employee's one (D-122). Below the card the page differs by role and by
 * the points switch, so the skeleton stops there and the rest appears under it.
 */
export function ProfileSkeleton() {
  const role = useTabRole() ?? "employee";
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Профиль" />
      <div className="mt-3">
        <ProfileCard pending role={role} />
      </div>
    </main>
  );
}
