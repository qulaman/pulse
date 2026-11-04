import { apiOk } from "@/lib/api/respond";
import type { OperatorsAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

export const GET = withOps({ gate: "read" }, async ({ db }) =>
  apiOk({ operators: await opsRpc(db, "ops_operators", {}) } satisfies OperatorsAnswer),
);
