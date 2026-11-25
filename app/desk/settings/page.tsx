"use client";


import { useDeskParams } from "@/components/desk/DeskAddress";
import { SettingsPanels } from "@/components/desk/settings/SettingsPanels";
import { parseSettingsTab } from "@/lib/settings-tabs";

/**
 * «Настройки» on the desk: the four tabs of the phone (D-85) — «Компания», «Программа», «Очки и отчёты»,
 * «ИИ-модель»; `?tab=` opens one. The director and the secretary (D-104).
 */
export default function DeskSettingsPage() {
  const params = useDeskParams();
  return <SettingsPanels tab={parseSettingsTab(params.get("tab") ?? undefined)} />;
}
