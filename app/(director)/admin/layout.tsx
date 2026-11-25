import { redirect } from "next/navigation";

import { deskDevTools } from "@/lib/lab/access";

/**
 * «Данные» are the developers' (owner, 2026-11-04): the raw tables open only in a company with
 * `settings.dev_tools`, as on the desk. A client's direct address leads to «Настройки».
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await deskDevTools())) redirect("/settings");
  return children;
}
