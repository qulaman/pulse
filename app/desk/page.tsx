import { redirect } from "next/navigation";

import { getSessionProfile } from "@/lib/auth";
import { deskHomeFor } from "@/lib/desk/routes";

/** `/desk` itself is no screen: the director goes to the tasks, the secretary to the errands. */
export default async function DeskIndex() {
  const profile = await getSessionProfile();
  redirect(deskHomeFor(profile.role));
}
