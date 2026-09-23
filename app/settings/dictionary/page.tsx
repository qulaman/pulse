import { DictionaryScreen } from "@/components/dictionary/DictionaryScreen";
import { DictionaryHead } from "@/components/dictionary/DictionarySkeleton";
import { parseDictionaryTab } from "@/lib/dictionary-tabs";

/**
 * «Словарь» (D-111): the names people are called by and the words the recogniser has to
 * spell, with instructions and edits saved on the tap. The director and the secretary —
 * the settings layout lets nobody else in (D-104). `?tab=names|words` opens a tab,
 * `?from=team` sends «назад» to «Сотрудники» instead of «ИИ-модель».
 */
export default async function DictionaryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; from?: string | string[] }>;
}) {
  const { tab, from } = await searchParams;
  const initialTab = parseDictionaryTab(tab);
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <DictionaryHead back={from === "team" ? "/settings?tab=team" : "/settings?tab=ai"} />
      <DictionaryScreen key={initialTab} initialTab={initialTab} />
    </main>
  );
}
