import { after } from "next/server";
import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";
import { loadCompanySettings } from "@/lib/roster";
import { sceneOf } from "@/lib/errands/scene";
import { parseCompanySettings } from "@/lib/settings";

/**
 * A request said into the small secretary's desk (D-99): not a button of the catalogue, the
 * director's own words — the label is their first words, the whole phrase is the note.
 */
const FREE_KIND = "free";

const BodySchema = z.strictObject({
  /** The catalogue code; the label is the server's, never the client's (D-56). */
  kind: z.string().trim().min(1).max(32),
  note: z.string().trim().max(200).optional(),
  client_request_id: z.uuid(),
  /** The voice path of phase D: the recording is already in Storage (principle 5). */
  audio_path: z.string().trim().max(400).optional(),
  source_transcript: z.string().trim().max(2000).optional(),
  inbox_item_id: z.uuid().optional(),
  /** «Не беспокоить на 30 мин» (D-99): the request ends by itself after this many minutes. */
  until_min: z.number().int().min(5).max(12 * 60).optional(),
});

/**
 * «Кофе» in one tap: the director asks, every active secretary hears it at once.
 * The label is copied from the catalogue here and frozen in the row — renaming a
 * button later must not rewrite what was already asked for (D-79 §4). A repeat of
 * the same client_request_id hits the unique index and is answered as a duplicate,
 * so the tap that came twice through a bad connection buys one cup, not two.
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ req, profile, body }) => {
    const settings = parseCompanySettings(await loadCompanySettings(profile.companyId));
    const free = body.kind === FREE_KIND;
    const words = (body.note || body.source_transcript || "").trim();
    if (free && !words) return apiError(400, "empty_request", "Пустая просьба");
    const action = free
      ? { code: FREE_KIND, label: words.split(/\s+/).slice(0, 5).join(" ").slice(0, 40) }
      : settings.secretary.actions.find((a) => a.code === body.kind);
    if (!action) return apiError(400, "unknown_kind", "Такой кнопки нет в каталоге");
    // an alarm is known by its scene, never by what the client says (D-99)
    const urgent = !free && sceneOf({ kind: action.code, label: action.label }, settings.secretary.actions) === "security";

    const supabase = await userSupabase(req);
    const { data, error } = await supabase
      .from("errands")
      .insert({
        company_id: profile.companyId,
        author_id: profile.userId,
        kind: action.code,
        label: action.label,
        note: body.note || null,
        audio_path: body.audio_path || null,
        source_transcript: body.source_transcript || null,
        inbox_item_id: body.inbox_item_id || null,
        client_request_id: body.client_request_id,
        urgent,
        until_at: body.until_min ? new Date(Date.now() + body.until_min * 60_000).toISOString() : null,
      })
      .select("id, status")
      .single();

    if (error) {
      // 23505: the same tap arrived twice — the first one already went out; its row goes back,
      // so «Отменить» after a replay still finds what to take back (D-106)
      if (error.code === "23505") {
        const { data: first } = await supabase
          .from("errands")
          .select("id, status")
          .eq("client_request_id", body.client_request_id)
          .maybeSingle();
        return apiOk({ errand: first ?? null, duplicate: true });
      }
      if (error.code === "42501") return apiError(403, "forbidden", "Нет доступа");
      throw new Error(`errand insert failed: ${error.message}`);
    }

    // the queue is kicked at once: an errand that waits for the minute sweep is cold coffee
    after(() => kickDeliveries());
    return apiOk({ errand: data, duplicate: false });
  },
  BodySchema,
);
