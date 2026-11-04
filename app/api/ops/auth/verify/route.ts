import { apiError, apiOk } from "@/lib/api/respond";
import { VerifyBodySchema, type VerifyAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { OpsRpcError } from "@/lib/ops/guard";
import { withOps } from "@/lib/ops/handler";

const WRONG_CODE = new Set(["mfa_verification_failed", "mfa_verification_rejected", "mfa_challenge_expired"]);

/**
 * The code from the authenticator (D-157): it finishes a sign-in, turning the session into aal2,
 * and on a finished one it renews the TOTP's freshness `ops.assert` reads (`auth.mfa_amr_claims`).
 * The first sign-in names the factor just enrolled, later ones have one. A wrong code is 400: a
 * 401 would take the operator out of the dialog.
 */
export const POST = withOps({ gate: "open", schema: VerifyBodySchema }, async ({ db, body }) => {
  const state = await opsRpc(db, "ops_login_state", {});
  if (!state.operator) throw new OpsRpcError("ops_denied");

  let factorId = body.factor_id;
  if (!factorId) {
    const { data, error } = await db.auth.mfa.listFactors();
    if (error) throw new OpsRpcError("ops_denied");
    factorId = data.totp[0]?.id;
  }
  if (!factorId) return apiError(409, "not_enrolled", "Сначала подключи приложение");

  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code: body.code });
  if (error) {
    if (error.code && WRONG_CODE.has(error.code)) return apiError(400, "bad_code", "Код не подошёл");
    console.error("ops mfa verify failed:", error.code, error.message);
    return apiError(502, "auth_failed", "Не получилось проверить код, попробуй ещё раз");
  }
  return apiOk({ ok: true } satisfies VerifyAnswer);
});
