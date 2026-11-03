"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { PageTitle } from "@/components/desk/ui/PageTitle";
import { DictionaryScreen } from "@/components/dictionary/DictionaryScreen";
import { parseDictionaryTab } from "@/lib/dictionary-tabs";

/** The people of «Имена» side by side: one rule on the list the panel draws, nothing forked. */
const NAMES_TWO_COLUMNS =
  "[&_#dictionary-panel-names>div>ul]:grid [&_#dictionary-panel-names>div>ul]:grid-cols-2 [&_#dictionary-panel-names>div>ul]:items-start";

/**
 * «Словарь» on the desk (D-111): the phone's screen as it is, in a wider column. `?tab=names|words`
 * opens a tab; the screen keeps the tab in the address itself.
 */
export default function DeskDictionaryPage() {
  const params = useSearchParams();
  const [initialTab] = useState(() => parseDictionaryTab(params.get("tab") ?? undefined));
  return (
    <div className={`flex w-full max-w-[960px] flex-col ${NAMES_TWO_COLUMNS}`}>
      <PageTitle title="Словарь" state={{ text: "как ИИ слышит имена людей и слова компании" }} />
      <DictionaryScreen initialTab={initialTab} />
    </div>
  );
}
