/** The lab's tabs in order; `?tab=` carries one of these keys. */
export const LAB_TABS = ["models", "costs"] as const;
export type LabTab = (typeof LAB_TABS)[number];

/** An unknown or missing `?tab=` opens the models. */
export function parseLabTab(value: string | string[] | undefined): LabTab {
  const key = Array.isArray(value) ? value[0] : value;
  return LAB_TABS.find((tab) => tab === key) ?? "models";
}
