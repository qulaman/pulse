import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { ENTRY_MAX_LENGTH, VOCABULARY_MAX, mergeEntries } from "@/lib/dictionary";
import { loadCompanySettings } from "@/lib/roster";
import { parseCompanySettings } from "@/lib/settings";
import type { Json } from "@/lib/supabase/types";

const BodySchema = z
  .object({
    add: z.array(z.string().trim().min(1).max(ENTRY_MAX_LENGTH)).max(VOCABULARY_MAX).optional(),
    remove: z.array(z.string().trim().min(1)).max(VOCABULARY_MAX).optional(),
  })
  .strict();

type Body = z.infer<typeof BodySchema>;

/**
 * Words in and out of the company vocabulary (D-111). The director and the secretary may
 * both be editing it: the list is merged here against the stored one, so neither
 * overwrites the other with a stale copy. Set semantics make a replay harmless — there
 * is no request id to carry.
 */
export const POST = withAuth<Body>(
  ["director", "secretary"],
  async ({ req, profile, body }) => {
    const current = parseCompanySettings(await loadCompanySettings(profile.companyId));
    const { list, overflow } = mergeEntries(current.vocabulary, body.add ?? [], body.remove ?? [], VOCABULARY_MAX);
    if (overflow.length) {
      return apiError(422, "vocabulary_full", `В словаре уже ${VOCABULARY_MAX} слов — сначала уберите лишние`);
    }

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("update_company_settings", { patch: { vocabulary: list } as Json });
    if (error) {
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      throw new Error(`update_company_settings failed: ${error.message}`);
    }
    return apiOk({ settings: parseCompanySettings(data) });
  },
  BodySchema,
);
