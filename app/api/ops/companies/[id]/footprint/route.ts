import { apiOk } from "@/lib/api/respond";
import type { Footprint } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

export const GET = withOps({ gate: "read" }, async ({ db, params }) =>
  apiOk((await opsRpc(db, "ops_company_footprint", { p_company: params.id })) satisfies Footprint),
);
