import { Suspense } from "react";

import { AuditLog } from "@/components/ops/log/AuditLog";

/** /ops/log[?company=<id>&action=<code>&q=<words>]: the card of a company links here with its filter on. */
export default async function OpsLogPage({ searchParams }: { searchParams: Promise<{ company?: string | string[] }> }) {
  const { company } = await searchParams;
  return (
    <Suspense>
      <AuditLog company={typeof company === "string" && company ? company : null} />
    </Suspense>
  );
}
