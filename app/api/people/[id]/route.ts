import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { canChangeAccess } from "@/lib/people/access";
import { AVATAR_BUCKET, avatarPathOf } from "@/lib/people/avatar";
import { OPEN, openWork, type OpenTask } from "@/lib/people/handover";
import { AUTO_ROWS, HISTORY_SOURCES, STILL_REFERENCED, deleteRefusal, historyLines, sourceKey, type HistorySource } from "@/lib/people/history";
import type { Role } from "@/lib/routes";
import { createServiceSupabase } from "@/lib/supabase/service";

type Service = ReturnType<typeof createServiceSupabase>;

/** Tables asked at once by the card's quick question. */
const PROBE = 8;
type Target = { id: string; role: Role; avatar_url: string | null };

/** The person, inside the caller's company only: somebody of another company simply is not there. */
async function findTarget(service: Service, rawId: string, companyId: string): Promise<Target | null> {
  const id = z.guid().safeParse(rawId); // guid: seed ids are not RFC-4122
  if (!id.success) return null;
  const { data, error } = await service
    .from("profiles")
    .select("id, role, avatar_url")
    .eq("id", id.data)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(`profile read failed: ${error.message}`);
  return data;
}

/** Rows of one foreign key to the person. The table and the column come from the list a test holds against the migrations. */
async function countSource(service: Service, source: HistorySource, personId: string): Promise<number> {
  const base = service.from(source.table as "tasks").select(source.column, { count: "exact", head: true }).eq(source.column as "id", personId);
  const scoped = source.only ? base.eq(source.only.column as "id", source.only.value) : base;
  const { count, error } = await (source.notSelf ? scoped.neq(source.notSelf as "id", personId) : scoped);
  if (error) throw new Error(`history count failed: ${sourceKey(source)}: ${error.message}`);
  return count ?? 0;
}

/**
 * Rows per foreign key to the person (lib/people/history.ts). By the person's id alone, after the
 * company check: a stray row of another company would still be taken by the cascade, so it has
 * to stop the delete, not hide behind a filter. Only counts leave this function.
 */
async function countHistory(service: Service, personId: string): Promise<Record<string, number>> {
  const counted = await Promise.all(HISTORY_SOURCES.map(async (source) => [sourceKey(source), await countSource(service, source, personId)] as const));
  return Object.fromEntries(counted);
}

/** The same question answered yes or no, the likeliest tables first: a card that worked stops after the first few. */
async function hasHistory(service: Service, personId: string): Promise<boolean> {
  for (let at = 0; at < HISTORY_SOURCES.length; at += PROBE) {
    const counts = await Promise.all(HISTORY_SOURCES.slice(at, at + PROBE).map((source) => countSource(service, source, personId)));
    if (counts.some((count) => count > 0)) return true;
  }
  return false;
}

/**
 * What stands behind a card (the owner, 2026-11-04): may it be deleted, and the person's open
 * work. Tasks are read here because neither viewer sees them all under RLS: a secretary sees none
 * (she gets the numbers, D-104), a director does not see scheduled tasks of other authors. Task
 * titles go to the director only.
 */
export const GET = withAuth(["director", "secretary"], async ({ profile, params }) => {
  const service = createServiceSupabase();
  const target = await findTarget(service, params.id, profile.companyId);
  if (!target) return apiError(404, "not_found", "Сотрудник не найден");
  const editor = { id: profile.userId, role: profile.role };
  if (!canChangeAccess(editor, target)) return apiError(403, "forbidden", "Эту карточку менять нельзя");

  const [worked, open] = await Promise.all([
    hasHistory(service, target.id),
    service
      .from("tasks")
      .select("id, title, status, deadline")
      .eq("company_id", profile.companyId)
      .eq("assignee_id", target.id)
      .in("status", [...OPEN])
      .order("deadline", { ascending: true, nullsFirst: false }),
  ]);
  if (open.error) throw new Error(`open tasks read failed: ${open.error.message}`);

  return apiOk({
    deletable: !worked && deleteRefusal(editor, target, []) === null,
    open: openWork((open.data ?? []) as OpenTask[], profile.role === "director"),
  });
});

/**
 * Deletes a card that has no history (the owner, 2026-11-04, narrowing D-104 §7): a duplicate or
 * a typo. Everything else is a firing. The login goes, the profile and its housekeeping cascade
 * after it; a foreign key that still holds stops the whole delete, the answer is 409. A card that
 * is already gone — a second press, or an id this company never had — is a success with nothing
 * done: the same answer in both cases says nothing about other companies.
 */
export const DELETE = withAuth(["director", "secretary"], async ({ profile, params }) => {
  const service = createServiceSupabase();
  const target = await findTarget(service, params.id, profile.companyId);
  if (!target) return apiOk({ deleted: true });
  const editor = { id: profile.userId, role: profile.role };

  const barred = deleteRefusal(editor, target, null);
  if (barred) return apiError(barred.status, barred.code, barred.message);
  const refused = deleteRefusal(editor, target, historyLines(await countHistory(service, target.id)));
  if (refused) return apiError(refused.status, refused.code, refused.message);

  // what the tick wrote about a card nobody used: the key does not cascade, it would stop the delete
  const auto = await service
    .from(AUTO_ROWS.table)
    .delete()
    .eq(AUTO_ROWS.column, target.id)
    .eq("status", AUTO_ROWS.status)
    .eq("company_id", profile.companyId);
  if (auto.error) throw new Error(`auto rows delete failed: ${auto.error.message}`);

  const removed = await service.auth.admin.deleteUser(target.id);
  if (removed.error) {
    const message = removed.error.message ?? "";
    if (removed.error.status === 404 || /not found/i.test(message)) return apiOk({ deleted: true });
    if (/database error|foreign key|violates/i.test(message)) {
      console.error("deleteUser stopped by a row:", target.id, message);
      return apiError(STILL_REFERENCED.status, STILL_REFERENCED.code, STILL_REFERENCED.message);
    }
    console.error("deleteUser failed:", message);
    return apiError(502, "auth_failed", "Не получилось удалить карточку, попробуй ещё раз");
  }

  // the photo goes with the card; a file left behind harms nobody, so it does not fail the answer
  const photo = avatarPathOf(target.avatar_url, profile.companyId);
  if (photo) {
    const { error } = await service.storage.from(AVATAR_BUCKET).remove([photo]);
    if (error) console.error("avatar remove failed:", error.message);
  }
  return apiOk({ deleted: true });
});
