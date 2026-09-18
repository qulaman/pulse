import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { editDiff } from "@/lib/ai/edit-diff";
import { EntitySchema, type Entity } from "@/lib/ai/schema";
import { kickDeliveries } from "@/lib/push/send";

/**
 * /confirm hands back what it rendered, so entities still carry the service
 * fields postprocess() added. They are stripped here — the RPC contract is the
 * parser schema, nothing else.
 */
const SERVICE_FIELDS = new Set(["assignee", "participants", "blocked"]);

const IncomingEntity = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([key]) => !SERVICE_FIELDS.has(key)),
  );
}, EntitySchema);

const BodySchema = z.strictObject({
  client_request_id: z.uuid(),
  source: z.enum(["voice", "typed", "shared"]),
  audio_path: z.string().nullable().optional(), // typed input has no recording
  transcript: z.string(),
  parsed_entities: z.array(IncomingEntity),
  confirmed_entities: z.array(IncomingEntity),
  force_now: z.boolean().optional(),
  inbox_id: z.uuid().optional(),
  note_id: z.uuid().optional(),
});

export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, body }) => {
    const parsed = body.parsed_entities as Entity[];
    const confirmed = body.confirmed_entities as Entity[];
    // The edit ratio metric of the pilot and the evals loop (D-35, AI.md §10).
    const { was_edited, edit_fields } = editDiff(parsed, confirmed);

    // User's own client: confirm_voice_batch checks the director role itself.
    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("confirm_voice_batch", {
      payload: {
        source: body.source,
        audio_path: body.audio_path ?? null,
        transcript: body.transcript,
        confirmed_entities: confirmed,
        was_edited,
        edit_fields,
        force_now: body.force_now ?? false,
        inbox_id: body.inbox_id ?? null,
        note_id: body.note_id ?? null,
      },
      client_request_id: body.client_request_id,
    });

    if (error) {
      if (error.message.includes("assignee_required")) {
        return apiError(400, "assignee_required", "Не понял, кому задача — выбери исполнителя");
      }
      if (error.message.includes("event_time_required")) {
        return apiError(400, "event_time_required", "Не понял, когда мероприятие — выбери время");
      }
      if (error.message.includes("forbidden")) {
        return apiError(403, "forbidden", "Нет доступа");
      }
      throw new Error(`confirm_voice_batch failed: ${error.message}`);
    }

    const { duplicate = false, ...result } = (data ?? {}) as Record<string, unknown>;
    // the triggers queued the pushes; send them once the response is on its way
    after(() => kickDeliveries());
    return apiOk({ result, duplicate });
  },
  BodySchema,
);
