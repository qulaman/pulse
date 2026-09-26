import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
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
    if (!z.guid().safeParse(taskId).success) {
      return apiError(404, "task_not_found", "Задача не найдена");
    }

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
      if (error.message.includes("task_not_found")) return apiError(404, "task_not_found", "Задача не найдена");
      if (error.message.includes("assignee_not_found")) return apiError(404, "assignee_not_found", "Такого сотрудника нет");
      if (error.message.includes("same_assignee")) return apiError(409, "same_assignee", "Это тот же человек");
      if (error.message.includes("bad_deadline")) return apiError(400, "bad_deadline", "Этот срок уже прошёл — выберите время впереди");
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      if (error.message.includes("invalid_transition")) {
        return apiError(409, "invalid_transition", "Так нельзя: статус уже изменился");
      }
      throw new Error(`reassign_task failed: ${error.message}`);
    }

    after(() => kickDeliveries());

    const { duplicate = false, ...result } = (data ?? {}) as Record<string, unknown>;
    return apiOk({ result, duplicate });
  },
  BodySchema,
);
