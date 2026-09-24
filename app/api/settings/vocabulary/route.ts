import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { ENTRY_MAX_LENGTH, VOCABULARY_MAX, applyVocabularyEdit } from "@/lib/dictionary";
import { loadCompanySettings } from "@/lib/roster";
import { parseCompanySettings } from "@/lib/settings";
import type { Json } from "@/lib/supabase/types";

const Word = z.string().trim().min(1).max(ENTRY_MAX_LENGTH);
const Kind = z.string().min(1).max(40).nullable();

const BodySchema = z
  .object({
    add: z.array(Word).max(VOCABULARY_MAX).optional(),
    remove: z.array(z.string().trim().min(1)).max(VOCABULARY_MAX).optional(),
    kind: Kind.optional(),
    set_kind: z.strictObject({ word: Word, kind: Kind }).optional(),
    rename: z.strictObject({ from: z.string().trim().min(1), to: Word }).optional(),
  })
  .strict();

type Body = z.infer<typeof BodySchema>;

/**
 * Words in and out of the company vocabulary, a kind set, a spelling fixed (D-111). The
 * director and the secretary may both be editing it: the edit is applied here to the
 * stored list and its meta (`applyVocabularyEdit` — the screen runs the same function
 * optimistically), so neither overwrites the other with a stale copy. Every part has set
 * semantics, so a replay from the outbox is harmless and needs no request id.
 */
export const POST = withAuth<Body>(
  ["director", "secretary"],
  async ({ req, profile, body }) => {
    const current = parseCompanySettings(await loadCompanySettings(profile.companyId));
    const out = applyVocabularyEdit(
      current.vocabulary,
      current.vocabulary_meta,
      body,
      { at: new Date().toISOString(), by: profile.fullName },
      current.word_kinds,
    );
    if (out.overflow.length) {
      return apiError(422, "vocabulary_full", `В словаре уже ${VOCABULARY_MAX} слов — сначала уберите лишние`);
    }
    if (out.conflict) return apiError(409, "vocabulary_conflict", out.conflict);

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("update_company_settings", {
      patch: { vocabulary: out.vocabulary, vocabulary_meta: out.meta } as Json,
    });
    if (error) {
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      throw new Error(`update_company_settings failed: ${error.message}`);
    }
    return apiOk({ settings: parseCompanySettings(data) });
  },
  BodySchema,
);
