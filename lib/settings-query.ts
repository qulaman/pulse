import type { CompanySettings } from "@/lib/settings";

/** One cache entry for the company settings: the settings tabs and the dictionary share it. */
export const settingsKey = ["settings"] as const;

export async function fetchSettings(): Promise<CompanySettings> {
  const res = await fetch("/api/settings", { credentials: "include" });
  if (!res.ok) throw new Error("settings failed");
  return ((await res.json()) as { settings: CompanySettings }).settings;
}
