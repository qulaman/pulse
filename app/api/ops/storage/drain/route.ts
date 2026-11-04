import { apiOk } from "@/lib/api/respond";
import type { DrainAnswer } from "@/lib/ops/contract";
import { drainStorage, opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

export const maxDuration = 60;

/** The same queue the sweep drains, by hand. */
export const POST = withOps({ gate: "operator" }, async ({ service }) => {
  const removed = await drainStorage(service, 40_000);
  const left = await opsRpc(service, "ops_storage_left", { p_company: null });
  return apiOk({ removed, left } satisfies DrainAnswer);
});
