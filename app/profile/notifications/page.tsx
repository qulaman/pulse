import { redirect } from "next/navigation";

import { NotifySettings } from "@/components/notify/NotifySettings";
import { PageHead } from "@/components/ui/PageHead";
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
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <PageHead
        back={{ href: "/profile", label: "Профиль" }}
        title="Уведомления"
        sub="Как и когда Pulse зовёт вас. Всё видно и в приложении — здесь только то, что будит телефон."
      />
      <NotifySettings meId={profile.userId} />
    </main>
  );
}
