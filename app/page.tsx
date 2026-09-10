import { redirect } from "next/navigation";

/** The proxy routes signed-in users by role before this page renders. */
export default function RootPage() {
  redirect("/login");
}
