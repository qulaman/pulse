/** The two tabs of «Словарь» (D-111); `?tab=` opens one directly. */
export const DICTIONARY_TABS = ["names", "words"] as const;
export type DictionaryTab = (typeof DICTIONARY_TABS)[number];

export function parseDictionaryTab(value: string | string[] | undefined): DictionaryTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return DICTIONARY_TABS.includes(tab as DictionaryTab) ? (tab as DictionaryTab) : "names";
}
