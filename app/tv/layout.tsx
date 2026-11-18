import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { KioskLife, KioskReconnect } from "@/components/tv/KioskLife";
import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";
import { WALL_WATCHDOG_SCRIPT } from "@/lib/tv/kiosk-signal";

export const metadata: Metadata = { title: "Пульс — ТВ" };

/**
 * Киоск: собственный layout без шапки, таб-бара и голосовой кнопки — на стене нечего
 * нажимать (docs/FRONTEND.md «ТВ-режим»). Вход — auth-пользователь роли `tv`; директор
 * пускается тоже, чтобы посмотреть экран со своего ноутбука, не логинясь в киоск.
 * Курсор спрятан: мышь к мини-ПК подключена только на время настройки.
 *
 * Стена живёт сутками без людей (D-182). Нет сессии (401/403) — «Подключить экран»
 * `/tv-connect`, а не форма входа: там код, который директор вводит на пульте. База не
 * ответила на проверку сессии (503) — «Переподключаюсь…», который сам спрашивает снова:
 * секундный сбой не должен оставить стену на форме входа на весь день. Жизнь киоска —
 * `KioskLife` рядом со страницей, вне её границы ошибок (`error.tsx`); сторож без React —
 * встроенный скрипт, который перезагрузит страницу, замолчавшую на две минуты.
 */
export default async function TvLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError && error.status === 503) {
      return (
        <WallShell>
          <KioskReconnect />
        </WallShell>
      );
    }
    if (error instanceof AuthError) redirect("/tv-connect");
    throw error;
  }
  if (profile.role !== "tv" && profile.role !== "director") redirect(homeForRole(profile.role));

  return (
    <WallShell>
      {children}
      <KioskLife role={profile.role} companyId={profile.companyId} />
    </WallShell>
  );
}

function WallShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden bg-bg" style={{ cursor: "none" }}>
      <script dangerouslySetInnerHTML={{ __html: WALL_WATCHDOG_SCRIPT }} />
      {children}
    </div>
  );
}
