import { after } from "next/server";
import { z } from "zod";

import { TASK_ID, userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk, NO_ACCESS, NO_PERSON, NO_TASK, rpcFailure, rpcResult } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

const BodySchema = z.strictObject({
  /** the words of the task as they should be — always the whole of them */
  title: z.string().trim().min(1).max(500),
  /** the details; null or empty — none */
  body: z.string().max(4000).nullable(),
  /** sent only when it changes */
  priority: z.enum(["low", "normal", "high"]).optional(),
  /** the deadline is sent only when it changes: null — «без срока» */
  deadline_iso: z.string().datetime({ offset: true }).nullable().optional(),
  change_deadline: z.boolean().optional(),
  /** another person: the task goes to them the way «Передать» gives it (D-128) */
  assignee_id: z.guid().optional(),
  /** the director's word to the new person, rides in their push */
  note: z.string().max(500).optional(),
  client_request_id: z.uuid(),
});

/**
 * «Изменить задачу» (D-200): the director rewrites an open task — its words, its details,
 * «срочно», its deadline, its person — in one RPC (principle 7). The task keeps its status; its
 * person reads what changed in the thread and gets one push; a new person gets the task the way
 * «Передать» gives it; a task held for later changes quietly.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body, params }) => {
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("edit_task", {
      task_id: params.id,
      new_title: body.title,
      // «no details» and «без срока» are null, and the RPC takes them; the generated Args type
      // drops the nullability of a function argument, so the casts say what the SQL signature says
      new_body: (body.body?.trim() || null) as string,
      new_priority: body.priority,
      change_deadline: body.change_deadline ?? false,
      new_deadline: (body.deadline_iso ?? null) as string,
      new_assignee_id: body.assignee_id,
      note: body.note?.trim() || undefined,
      client_request_id: body.client_request_id,
    });

    if (error) {
      return rpcFailure(
        error,
        {
          task_not_found: NO_TASK,
          forbidden: NO_ACCESS,
          assignee_not_found: NO_PERSON,
          empty_title: [422, "Без текста задачу не сохранить"],
          deadline_in_past: [422, "Это время уже прошло — выберите позже"],
          deadline_before_send: [422, "Задача уйдёт позже этого времени — выберите позже"],
          invalid_transition: [409, "Задача уже закрыта или сдана — так изменить нельзя"],
        },
        "edit_task",
      );
    }

    // the push «Задача изменена» (or the new person's task) goes out right away, not with the sweep
    after(() => kickDeliveries());

    return apiOk(rpcResult(data));
  },
  BodySchema,
  { id: TASK_ID },
);
