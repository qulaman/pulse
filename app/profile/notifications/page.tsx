import { redirect } from "next/navigation";

import { NotificationsScreen } from "@/components/notify/NotificationsScreen";
import { NotifySettings } from "@/components/notify/NotifySettings";
import { getSessionProfile } from "@/lib/auth";

/**
 * «Уведомления» (D-114): the director's own push rules — what comes at once, quietly, in a
 * digest or not at all; the quiet hours, meetings, important people, the lock screen and the
 * devices. Only the director: everybody else lives by the system's fixed policy.
 */
export default async function NotificationsPage() {
  const profile = await getSessionProfile();
  if (profile.role !== "director") redirect("/profile");

  return (
    <NotificationsScreen>
      <NotifySettings meId={profile.userId} />
    </NotificationsScreen>
  );
}
