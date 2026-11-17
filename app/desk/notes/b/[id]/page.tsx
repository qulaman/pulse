import { redirect } from "next/navigation";

/** A board's old desk address (bookmarks, toasts, pushes before D-177): the boards have their own section now. */
export default async function OldDeskBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/desk/boards/${id}`);
}
