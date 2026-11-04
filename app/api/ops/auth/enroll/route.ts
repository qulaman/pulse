import { apiError, apiOk } from "@/lib/api/respond";
import type { EnrollAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { OpsRpcError } from "@/lib/ops/guard";
import { withOps } from "@/lib/ops/handler";

/** What the SDK prepends to the server's SVG; the answer carries the SVG itself. */
const SVG_DATA_URL = "data:image/svg+xml;utf-8,";

/**
 * The authenticator of a first sign-in (D-157). One factor per operator: a second one, or a stolen
 * password over a set-up account, is refused — a lost phone goes through `ops:grant --reset-mfa`.
 * A QR closed half-way left an unverified factor, which is dropped here.
 */
export const POST = withOps({ gate: "open" }, async ({ db }) => {
  const state = await opsRpc(db, "ops_login_state", {});
  if (!state.operator) throw new OpsRpcError("ops_denied");

  const { data: factors, error: listError } = await db.auth.mfa.listFactors();
  if (listError) throw new OpsRpcError("ops_denied");
  if (factors.totp.length > 0) return apiError(409, "already_enrolled", "Приложение уже подключено");

  for (const factor of factors.all) {
    if (factor.factor_type !== "totp") continue;
    const { error } = await db.auth.mfa.unenroll({ factorId: factor.id });
    if (error) throw new Error(`ops unenroll failed: ${error.message}`);
  }

  const { data, error } = await db.auth.mfa.enroll({ factorType: "totp", issuer: "Pulse Ops" });
  if (error) throw new Error(`ops enroll failed: ${error.message}`);

  return apiOk({
    factor_id: data.id,
    qr_svg: data.totp.qr_code.replace(SVG_DATA_URL, ""),
    secret: data.totp.secret,
    uri: data.totp.uri,
  } satisfies EnrollAnswer);
});
