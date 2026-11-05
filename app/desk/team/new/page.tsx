import { Suspense } from "react";

import { NewPersonDesk } from "@/components/desk/team/NewPersonDesk";

/** A new person (tasks/022 B.3): the director and the secretary, as on the phone (D-104). `?tab=list` — many at once. */
export default function DeskNewPersonPage() {
  return (
    <Suspense>
      <NewPersonDesk />
    </Suspense>
  );
}
