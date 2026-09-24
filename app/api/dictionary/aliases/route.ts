import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { ALIAS_MAX, ENTRY_MAX_LENGTH, mergeEntries } from "@/lib/dictionary";

const BodySchema = z.strictObject({
  person_id: z.uuid(),
  add: z.array(z.string().trim().min(1).max(ENTRY_MAX_LENGTH)).max(ALIAS_MAX).optional(),
  remove: z.array(z.string().trim().min(1)).max(ALIAS_MAX).optional(),
});

/**
 * The spoken names of one person in and out (D-111). Merged here against the row as it is
 * now — the director and the secretary may both be editing, and a stale list from a screen
 * would drop the other one's names. Read and written under the caller's own RLS, so the
 * secretary's hand stops at a director's row (D-104) exactly as in the person editor.
 * Set semantics make a replay from the outbox harmless: no request id to carry.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director", "secretary"],
  async ({ req, body }) => {
    const supabase = await userSupabase(req);
    const read = await supabase.from("profiles").select("aliases").eq("id", body.person_id).maybeSingle();
    if (read.error) throw new Error(`aliases read failed: ${read.error.message}`);
    if (!read.data) return apiError(404, "not_found", "Такого человека нет");

    const { list } = mergeEntries(read.data.aliases ?? [], body.add ?? [], body.remove ?? [], ALIAS_MAX);
    const { data, error } = await supabase
      .from("profiles")
      .update({ aliases: list })
      .eq("id", body.person_id)
      .select("id, aliases");
    if (error) {
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Эту карточку тебе менять нельзя");
      throw new Error(`aliases update failed: ${error.message}`);
    }
    // RLS filters a row the caller may not touch silently: an empty answer is a refusal
    if (!data?.length) return apiError(403, "not_permitted", "Эту карточку тебе менять нельзя");
    return apiOk({ id: data[0].id, aliases: data[0].aliases });
  },
  BodySchema,
);
