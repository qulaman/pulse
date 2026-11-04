import { apiOk } from "@/lib/api/respond";
import { issueOpsCode, loadCompany, loadPerson } from "@/lib/ops/accounts";
import { PersonLoginBodySchema, type PersonLoginAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { OpsRpcError } from "@/lib/ops/guard";
import { withOps } from "@/lib/ops/handler";

/**
 * A code for a person of a company (D-135 by the console's hand). The journal is written first: a
 * code is never out without a line about it. On a repeat of the request there is no code to show,
 * the base keeps only its hash.
 */
export const POST = withOps(
  {
    schema: PersonLoginBodySchema,
    action: "issue_login_code",
    company: ({ body }) => body.company_id,
    target: ({ params }) => ({ user_id: params.id }),
    replay: () => ({ login: null }),
  },
  async ({ req, service, ticket, body, params }) => {
    const person = await loadPerson(service, body.company_id, params.id);
    if (!person.is_active) throw new OpsRpcError("inactive");
    const company = await loadCompany(service, body.company_id);

    await opsRpc(service, "ops_log_action", {
      p_ticket: ticket,
      p_action: "issue_login_code",
      p_company: body.company_id,
      p_result: { user_id: params.id },
    });
    const login = await issueOpsCode(service, req, {
      userId: params.id,
      name: person.full_name,
      company,
      requestId: body.client_request_id,
    });
    return apiOk({ login, duplicate: false } satisfies PersonLoginAnswer);
  },
);
