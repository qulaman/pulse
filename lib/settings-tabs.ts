/** The four tabs of Настройки in tile order; `?tab=` carries one of these keys (D-85). */
export const SETTINGS_TABS = ["company", "app", "team", "ai"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/** An unknown or missing `?tab=` opens the first tile. */
export function parseSettingsTab(value: string | string[] | undefined): SettingsTab {
  const key = Array.isArray(value) ? value[0] : value;
  return SETTINGS_TABS.find((tab) => tab === key) ?? "company";
}
