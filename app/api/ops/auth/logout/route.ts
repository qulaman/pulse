import { apiOk } from "@/lib/api/respond";
import { withOps } from "@/lib/ops/handler";

/** This browser's console session only: the cookie goes, the operator's other sessions stay. */
export const POST = withOps({ gate: "open" }, async ({ db }) => {
  await db.auth.signOut({ scope: "local" });
  return apiOk({ ok: true });
});
