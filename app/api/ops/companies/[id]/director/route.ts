import { apiOk } from "@/lib/api/respond";
import { addOpsPerson, issueOpsCodeSoftly, loadCompany } from "@/lib/ops/accounts";
import { ChangeDirectorBodySchema, type ChangeDirectorAnswer, type ChangeDirectorBody } from "@/lib/ops/contract";
import { countMoved, deriveRequestId, opsRpc, type OpsClient } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";

/**
 * The new director as a person of the company, before the handover. Their own ticket and their own
 * key derived from the request: a repeat finds the person made by the try before, and a failed
 * handover leaves an ordinary employee, not a half-made director.
 */
async function ensureNewPerson(
  db: OpsClient,
  service: OpsClient,
  company: string,
  body: ChangeDirectorBody,
  person: NonNullable<ChangeDirectorBody["new_person"]>,
): Promise<string> {
  const outcome = await opsRpc(db, "ops_ticket", {
    p_action: "add_person",
    p_company: company,
    p_target: { role: "employee", for: "change_director" },
    p_reason: body.reason,
    p_client_request_id: deriveRequestId(body.client_request_id, "add_person"),
  });
  if (outcome.duplicate) return outcome.result.user_id as string;

  return addOpsPerson(service, {
    ticket: outcome.ticket,
    company,
    fullName: person.full_name,
    role: "employee",
    position: person.position,
    email: person.email,
  });
}

export const POST = withOps(
  {
    schema: ChangeDirectorBodySchema,
    action: "change_director",
    company: ({ params }) => params.id,
    target: ({ body }) => ({
      old_id: body.old_id,
      new_id: body.new_id ?? null,
      new_person: Boolean(body.new_person),
      old_fate: body.old_fate,
    }),
    replay: (result) => ({ new_id: result.new_id, moved: countMoved(result), login: null }),
  },
  async ({ req, db, service, ticket, body, params }) => {
    const person = body.new_person;
    const newId = person ? await ensureNewPerson(db, service, params.id, body, person) : (body.new_id as string);

    const result = await opsRpc(service, "ops_change_director", {
      p_ticket: ticket,
      p_company: params.id,
      p_old: body.old_id,
      p_new: newId,
      p_old_fate: body.old_fate,
    });

    // the handover stands: a code that failed comes from the card
    const login = person
      ? await issueOpsCodeSoftly(service, req, {
          userId: newId,
          name: person.full_name,
          company: await loadCompany(service, params.id),
          requestId: body.client_request_id,
        })
      : null;
    return apiOk({ new_id: newId, moved: countMoved(result), login, duplicate: false } satisfies ChangeDirectorAnswer);
  },
);
