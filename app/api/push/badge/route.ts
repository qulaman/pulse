import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";

/**
 * The number on the app icon (D-114, Badging API — the iPhone home-screen app and desktop;
 * Android shows the notification dot itself). What waits for this person's hand: for the
 * director — work handed back (на приёмке, отказы); for everybody else — work not yet taken
 * (новые, вернули на доработку). Counted under the caller's own RLS.
 */
export const GET = withAuth("any", async ({ req, profile }) => {
  const supabase = await userSupabase(req);
  const director = profile.role === "director";
  const query = supabase.from("tasks").select("id", { count: "exact", head: true });
  const { count } = director
    ? await query.eq("author_id", profile.userId).in("status", ["pending_review", "declined"])
    : await query.eq("assignee_id", profile.userId).in("status", ["sent", "rework"]);
  return apiOk({ count: count ?? 0 });
});
