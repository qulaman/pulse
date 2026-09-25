import { NotificationsScreen } from "@/components/notify/NotificationsScreen";
import { NotifyBones } from "@/components/notify/NotifySettings";

/** Route skeleton: the screen as it stands while the rules load — nothing shifts (D-122). */
export default function Loading() {
  return (
    <NotificationsScreen>
      <NotifyBones />
    </NotificationsScreen>
  );
}
