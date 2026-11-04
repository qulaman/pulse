import { redirect } from "next/navigation";

import { OpsLogin } from "@/components/ops/login/OpsLogin";
import { getOperator } from "@/lib/ops/server";

/** Open without a session (D-157); somebody already signed in has nothing to do here. */
export default async function OpsLoginPage() {
  if (await getOperator()) redirect("/ops");
  return <OpsLogin />;
}
