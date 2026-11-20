import { after } from "next/server";
import { z } from "zod";

import { TASK_ID, userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk, BAD_DEADLINE, NO_ACCESS, NO_PERSON, NO_TASK, rpcFailure, rpcResult, STATUS_MOVED } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  assignee_id: z.guid(),
  /** D-128: a new deadline for the new person (null — «без срока»); only with change_deadline */
  deadline_iso: z.string().datetime({ offset: true }).nullable().optional(),
  change_deadline: z.boolean().optional(),
  /** D-128: the director's word to the new person, rides in their push */
  note: z.string().max(500).optional(),
  client_request_id: z.uuid(),
});

/**
 * «Переназначить»: the same order goes to another person as a fresh task, the old one is
 * revoked with a pointer (D-01). One RPC does both; the outbox trigger notifies the new person.
 * The new person may get a new deadline and a word; the old holder hears «передана» (D-128).
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body, params }) => {
    const taskId = params.id;
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("reassign_task", {
      task_id: taskId,
      new_assignee_id: body.assignee_id,
      client_request_id: body.client_request_id,
      change_deadline: body.change_deadline ?? false,
      // «без срока» is null, and the RPC takes it; the generated Args type drops the
      // nullability of a function argument, so the cast says what the SQL signature says
      new_deadline: (body.deadline_iso ?? null) as string,
      note: body.note?.trim() || undefined,
    });

    if (error) {
      return rpcFailure(
        error,
        {
          task_not_found: NO_TASK,
          assignee_not_found: NO_PERSON,
          same_assignee: [409, "Это тот же человек"],
          bad_deadline: BAD_DEADLINE,
          forbidden: NO_ACCESS,
          invalid_transition: STATUS_MOVED,
        },
        "reassign_task",
      );
    }

    after(() => kickDeliveries());

    return apiOk(rpcResult(data));
  },
  BodySchema,
  { id: TASK_ID },
);
