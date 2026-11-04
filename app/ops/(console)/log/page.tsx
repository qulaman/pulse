import { AuditLog } from "@/components/ops/log/AuditLog";

/** /ops/log[?company=<id>]: the card of a company links here with its filter on. */
export default async function OpsLogPage({ searchParams }: { searchParams: Promise<{ company?: string | string[] }> }) {
  const { company } = await searchParams;
  return <AuditLog company={typeof company === "string" && company ? company : null} />;
}
