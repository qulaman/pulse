import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { parseSettingsTab } from "@/lib/settings-tabs";

/**
 * Настройки: everything that makes this instance this company, split into four tabs —
 * Компания, Программа, Сотрудники, ИИ-модель (D-84). `?tab=` opens one directly, so a
 * link from the rating («включить очки») or the secretary screen lands on the right tab.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-4">
      <h1 className="text-[24px] font-bold leading-[30px]">Настройки</h1>
      <p className="mt-1 text-[13px] leading-[18px] text-muted">
        Всё здесь — конфигурация компании: код одинаков для всех клиентов
      </p>
      <SettingsTabs initialTab={parseSettingsTab(tab)} />
    </main>
  );
}
