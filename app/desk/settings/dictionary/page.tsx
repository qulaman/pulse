"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { DictionaryDesk } from "@/components/desk/settings/dictionary/DictionaryDesk";
import { parseDictionaryTab } from "@/lib/dictionary-tabs";

/**
 * «Словарь» on the desk (D-111, D-154 wave 3): names and words as tables under one toolbar.
 * `?tab=names|words` opens a tab; the screen keeps the tab in the address itself.
 */
export default function DeskDictionaryPage() {
  const params = useSearchParams();
  const [initialTab] = useState(() => parseDictionaryTab(params.get("tab") ?? undefined));
  return <DictionaryDesk initialTab={initialTab} />;
}
