import { z } from "zod";

import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { KIND_LABEL_MAX, applyKindEdit } from "@/lib/dictionary";
import { loadCompanySettings } from "@/lib/roster";
import { parseCompanySettings } from "@/lib/settings";
import type { Json } from "@/lib/supabase/types";

const Id = z.string().min(1).max(40);
const Label = z.string().trim().min(1).max(KIND_LABEL_MAX);

const BodySchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("add"), id: Id, label: Label }),
  z.strictObject({ op: z.literal("rename"), id: Id, label: Label }),
  z.strictObject({ op: z.literal("remove"), id: Id, move_to: Id.nullable() }),
  z.strictObject({ op: z.literal("move"), id: Id, index: z.number().int().min(0).max(50) }),
]);

type Body = z.infer<typeof BodySchema>;

/**
 * The company's word types (D-111 §19): a type added, renamed, moved, or removed with its
 * words moved to another type or to «Без типа». Applied here to the stored types and word
 * meta (`applyKindEdit` — the screen runs the same function optimistically), so the director
 * and the secretary never overwrite each other. A new type brings its id from the screen,
 * so every edit is replay-safe from the outbox.
 */
export const POST = withAuth<Body>(
  ["director", "secretary"],
  async ({ req, profile, body }) => {
    const current = parseCompanySettings(await loadCompanySettings(profile.companyId));
    const out = applyKindEdit(current.word_kinds, current.vocabulary_meta, body);
    if (out.conflict) return apiError(409, "kind_conflict", out.conflict);

    const supabase = await userSupabase(req);
    const { data, error } = await supabase.rpc("update_company_settings", {
      patch: { word_kinds: out.kinds, vocabulary_meta: out.meta } as Json,
    });
    if (error) {
      if (error.message.includes("forbidden")) return apiError(403, "forbidden", "Нет доступа");
      throw new Error(`update_company_settings failed: ${error.message}`);
    }
    return apiOk({ settings: parseCompanySettings(data) });
  },
  BodySchema,
);
