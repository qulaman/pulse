import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";
import { myMoveFilter } from "@/lib/tasks/my-move";

/**
 * The number on the app icon (D-114, Badging API — the iPhone home-screen app and desktop;
 * Android shows the notification dot itself). What waits for this person's hand: for the
 * director — work handed back (на приёмке, отказы); for everybody else — the orders waiting for
 * their move (новые, вернули на доработку, просроченные), the same number as the «Дела» tab
 * (D-173). Counted under the caller's own RLS.
 */
export const GET = withAuth("any", async ({ req, profile }) => {
  const supabase = await userSupabase(req);
  const director = profile.role === "director";
  const query = supabase.from("tasks").select("id", { count: "exact", head: true });
  const { count } = director
    ? await query.eq("author_id", profile.userId).in("status", ["pending_review", "declined"])
    : await query.eq("assignee_id", profile.userId).or(myMoveFilter(new Date()));
  return apiOk({ count: count ?? 0 });
});
