import type { ReactNode } from "react";

import { PageHead } from "@/components/ui/PageHead";

/** The director's push rules (D-114): the screen's frame — for the page and for its skeleton. */
export function NotificationsScreen({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <PageHead
        back={{ href: "/profile", label: "Профиль" }}
        title="Уведомления"
        sub="Как и когда Pulse зовёт вас. Всё видно и в приложении — здесь только то, что будит телефон."
      />
      {children}
    </main>
  );
}
