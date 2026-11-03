"use client";

import { useSearchParams } from "next/navigation";

import { SettingsPanels } from "@/components/desk/settings/SettingsPanels";
import { parseSettingsTab } from "@/lib/settings-tabs";

/**
 * Настройки on the desk: the four tabs of the phone (D-85) — Компания, Программа, Сотрудники,
 * ИИ-модель; `?tab=` opens one. The director and the secretary (D-104).
 */
export default function DeskSettingsPage() {
  const params = useSearchParams();
  return <SettingsPanels tab={parseSettingsTab(params.get("tab") ?? undefined)} />;
}
