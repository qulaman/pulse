import { apiOk } from "@/lib/api/respond";
import type { MeAnswer } from "@/lib/ops/contract";
import { OpsRpcError } from "@/lib/ops/guard";
import { withOps } from "@/lib/ops/handler";

export const GET = withOps({ gate: "operator" }, async ({ db }) => {
  const { data } = await db.auth.getUser();
  if (!data.user) throw new OpsRpcError("ops_denied");
  return apiOk({ email: data.user.email ?? "", user_id: data.user.id } satisfies MeAnswer);
});
