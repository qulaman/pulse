import { redirect } from "next/navigation";

import { NoteDetail } from "@/components/desk/notes/NoteDetail";

/** The note chosen in the list (`?n`); the old «Доски» tab of the notes (`?tab=boards`) is a section of its own since D-177. */
export default async function DeskNotesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tab } = await searchParams;
  if (tab === "boards") redirect("/desk/boards");
  return <NoteDetail />;
}
