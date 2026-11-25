import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { PageHead } from "@/components/ui/PageHead";
import { profileOrLogin } from "@/lib/auth-layout";
import { deskDevTools } from "@/lib/lab/access";
import { parseSettingsTab } from "@/lib/settings-tabs";

/**
 * «Настройки»: everything that makes this instance this company, split into four tabs —
 * «Компания», «Программа», «Очки и отчёты», «ИИ-модель» (D-85). `?tab=` opens one directly, so a
 * link from the rating («включить очки») or the secretary screen lands on the right tab.
 * The director and the secretary (D-104); the layout lets nobody else in.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const { tab } = await searchParams;
  // the layout renders in parallel and redirects on its own; this only needs the role
  const { role } = await profileOrLogin();
  // «Данные» are the developers' tools (D-158): the row shows only with settings.dev_tools
  const devTools = await deskDevTools();
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Настройки" />
      {/* keyed by the tab: a link to another ?tab= from inside the page (the secretary
          section's «карточке человека») opens that tab instead of keeping the old one */}
      <SettingsTabs key={parseSettingsTab(tab)} initialTab={parseSettingsTab(tab)} role={role} devTools={devTools} />
    </main>
  );
}
