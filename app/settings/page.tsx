import { redirect } from "next/navigation";

import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { AuthError, getSessionProfile } from "@/lib/auth";
import { parseSettingsTab } from "@/lib/settings-tabs";

/**
 * Настройки: everything that makes this instance this company, split into four tabs —
 * Компания, Программа, Сотрудники, ИИ-модель (D-85). `?tab=` opens one directly, so a
 * link from the rating («включить очки») or the secretary screen lands on the right tab.
 * The director and the secretary (D-104); the layout lets nobody else in.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  // the layout renders in parallel and redirects on its own; this only needs the role
  const role = await getSessionProfile().then(
    (p) => p.role,
    (error: unknown) => {
      if (error instanceof AuthError) redirect("/login");
      throw error;
    },
  );
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-4">
      <h1 className="text-[24px] font-bold leading-[30px]">Настройки</h1>
      <p className="mt-1 text-[13px] leading-[18px] text-muted">
        Всё здесь — конфигурация компании: код одинаков для всех клиентов
      </p>
      {/* keyed by the tab: a link to another ?tab= from inside the page (the secretary
          section's «карточке человека») opens that tab instead of keeping the old one */}
      <SettingsTabs key={parseSettingsTab(tab)} initialTab={parseSettingsTab(tab)} role={role} />
    </main>
  );
}
