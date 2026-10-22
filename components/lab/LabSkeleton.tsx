"use client";

import { LabScreen } from "@/components/lab/LabScreen";
import { useTabRole } from "@/components/RoleScope";

/**
 * The lab's route skeleton (D-122) as the role will see it: the benches for the director and
 * the secretary, the shelf for the team while the company tests (D-150). The role comes from
 * the layout's `RoleScope`, so the first frame already matches the screen.
 */
export function LabSkeleton() {
  return <LabScreen tab="models" admin={useTabRole() !== "employee"} />;
}
