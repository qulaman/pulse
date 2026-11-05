import { redirect } from "next/navigation";

import { deskDevTools } from "@/lib/lab/access";

/** «Лаборатория» is the developers': a client's or a secretary's direct address leads to the settings. */
export default async function DeskLabLayout({ children }: { children: React.ReactNode }) {
  if (!(await deskDevTools())) redirect("/desk/settings");
  return children;
}
