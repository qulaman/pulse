import { Suspense } from "react";

import { TeamTable } from "@/components/desk/team/TeamTable";

/** «Команда» on the desk (D-153, tasks/022 B.1): the director's and the secretary's; `?p=` peeks at a person in the panel. */
export default function DeskTeamPage() {
  return (
    <Suspense>
      <TeamTable />
    </Suspense>
  );
}
