import { z } from "zod";

import { userSupabase, withAuth, type HandlerContext } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { canEditPerson } from "@/lib/people/access";
import { AVATAR_BUCKET, avatarPathFits, avatarPathOf } from "@/lib/people/avatar";
import { createServiceSupabase } from "@/lib/supabase/service";

const PutSchema = z.strictObject({
  /** `{company_id}/{key}.jpg`, already uploaded by the client (the bucket's insert policy). */
  path: z.string().min(1).max(120),
});

/** The card when the caller may change it (D-104); a card of another company is simply not found. */
async function loadCard<T>({ profile, params }: HandlerContext<T>): Promise<{ id: string; avatar_url: string | null } | Response> {
  const id = z.guid().safeParse(params.id); // guid: seed ids are not RFC-4122
  if (!id.success) return apiError(404, "not_found", "Сотрудник не найден");
  const { data, error } = await createServiceSupabase()
    .from("profiles")
    .select("id, role, avatar_url")
    .eq("id", id.data)
    .eq("company_id", profile.companyId)
    .maybeSingle();
  if (error) throw new Error(`profile read failed: ${error.message}`);
  if (!data) return apiError(404, "not_found", "Сотрудник не найден");
  if (!canEditPerson({ id: profile.userId, role: profile.role }, data)) return apiError(403, "forbidden", "Карточку директора меняет только директор");
  return data;
}

/** The new URL on the card, under the caller's own rights: RLS and the guard say the last word. */
async function writeUrl<T>(ctx: HandlerContext<T>, id: string, url: string | null): Promise<Response | null> {
  const supabase = await userSupabase(ctx.req);
  const { data, error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", id).eq("company_id", ctx.profile.companyId).select("id");
  if (error) {
    console.error("avatar_url update failed:", error.message);
    return apiError(502, "update_failed", "Не получилось сохранить фото, попробуй ещё раз");
  }
  return data?.length ? null : apiError(403, "forbidden", "Эту карточку менять нельзя");
}

/**
 * The file that stopped being anybody's photo. The client cannot remove it: Storage asks for a
 * select policy to delete, and the bucket has none so that it cannot be listed. Only a path in
 * the caller's own folder gets here (`avatarPathOf`). A file left behind harms nobody — logged.
 */
async function dropFile(url: string | null, keep: string | null, companyId: string) {
  const path = avatarPathOf(url, companyId);
  if (!path || path === keep) return;
  const { error } = await createServiceSupabase().storage.from(AVATAR_BUCKET).remove([path]);
  if (error) console.error("old avatar remove failed:", error.message);
}

/**
 * Puts an uploaded photo on the card; the previous file goes. Idempotent: the same path again
 * changes nothing, and it is the path that the client fixed when the photo was chosen.
 */
export const PUT = withAuth<z.infer<typeof PutSchema>>(
  ["director", "secretary"],
  async (ctx) => {
    const card = await loadCard(ctx);
    if (card instanceof Response) return card;
    const { path } = ctx.body;
    if (!avatarPathFits(path, ctx.profile.companyId)) return apiError(400, "validation_error", "Неверный запрос");

    const url = createServiceSupabase().storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
    const refused = await writeUrl(ctx, card.id, url);
    if (refused) return refused;
    await dropFile(card.avatar_url, path, ctx.profile.companyId);
    return apiOk({ avatar_url: url });
  },
  PutSchema,
);

/** Takes the photo off the card and removes the file. Idempotent: no photo — nothing to do. */
export const DELETE = withAuth(["director", "secretary"], async (ctx) => {
  const card = await loadCard(ctx);
  if (card instanceof Response) return card;
  if (card.avatar_url) {
    const refused = await writeUrl(ctx, card.id, null);
    if (refused) return refused;
    await dropFile(card.avatar_url, null, ctx.profile.companyId);
  }
  return apiOk({ avatar_url: null });
});
