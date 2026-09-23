import { redirect } from "next/navigation";

import { AuthError, getSessionProfile } from "@/lib/auth";

import { PersonCard } from "./PersonCard";

/**
 * The person's card with their tasks is the director's; the secretary lands straight on
 * the editor (D-104) — tasks, «Дать задачу» and the wall are not hers.
 */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // the layout renders in parallel and redirects on its own; this only needs the role
  const role = await getSessionProfile().then(
    (p) => p.role,
    (error: unknown) => {
      if (error instanceof AuthError) redirect("/login");
      throw error;
    },
  );
  if (role !== "director") redirect(`/people/${id}/edit`);
  return <PersonCard />;
}
