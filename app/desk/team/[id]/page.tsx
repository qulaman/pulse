import { Suspense } from "react";

import { PersonDesk } from "@/components/desk/team/PersonDesk";

/** The person's card with the editor (tasks/022 B.2); `?edit=1` opens the editor at once. */
export default async function DeskPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <PersonDesk key={id} id={id} />
    </Suspense>
  );
}
