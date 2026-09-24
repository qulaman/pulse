import { userSupabase, withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { NotifyPrefsSchema, parseNotifyPrefs, type NotifyPrefs } from "@/lib/push/prefs";

/**
 * The director's push rules (D-114): read and saved as one whole object. Only a director —
 * everybody else lives by the system's fixed policy and has nothing to read here. Saving goes
 * through the RPC, which also re-routes the pushes still waiting in the queue.
 */
export const GET = withAuth(["director"], async ({ req, profile }) => {
  const supabase = await userSupabase(req);
  const { data } = await supabase.from("notification_prefs").select("prefs").eq("user_id", profile.userId).maybeSingle();
  return apiOk({ prefs: parseNotifyPrefs(data?.prefs) });
});

export const PUT = withAuth<NotifyPrefs>(
  ["director"],
  async ({ req, body }) => {
    const supabase = await userSupabase(req);
    // the whole object every time: the same rules saved twice are the same state (принцип 7)
    const { data, error } = await supabase.rpc("set_notify_prefs", { p_prefs: body });
    if (error) {
      console.error("set_notify_prefs failed:", error.message);
      return apiError(502, "prefs_failed", "Не получилось сохранить — попробуйте ещё раз");
    }
    return apiOk({ prefs: parseNotifyPrefs(data) });
  },
  NotifyPrefsSchema,
);
