import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { OpsFrame } from "@/components/ops/shell/OpsFrame";
import { OPS_LOGIN_PATH } from "@/lib/ops/paths";
import { getOperator } from "@/lib/ops/server";

/** Everything of the console but its sign-in: nobody without an operator session sees even the frame. */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const operator = await getOperator();
  if (!operator) redirect(OPS_LOGIN_PATH);
  return <OpsFrame email={operator.email}>{children}</OpsFrame>;
}
