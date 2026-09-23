"use client";

import { Mascot } from "@/components/brand/Mascot";
import { EtherSection } from "@/components/ether/EtherSection";
import { PageHead } from "@/components/ui/PageHead";
import { useEther } from "@/lib/ether/queries";
import { useMe } from "@/lib/tasks/queries";

/**
 * Эфир: the director's announcements for everybody, «Ознакомился» under each (CONCEPT §3.1).
 * Not a tab any more (D-59) — reached from the fold on Пульс and Лента; the same cards.
 */
export default function EtherPage() {
  const me = useMe();
  const feed = useEther();
  const isDirector = me.data?.role === "director";
  const empty = !feed.isLoading && !me.isLoading && (feed.data ?? []).length === 0;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <PageHead
        title="Эфир"
        sub={isDirector ? "Скажи «всем: …» — объявление появится здесь у каждого" : "Объявления директора для всей компании"}
      />

      {empty ? (
        <div className="mt-6 flex flex-col items-center card px-6 py-10 text-center">
          <Mascot state="calm" size={72} />
          <p className="mt-4 text-[16px] leading-[22px]">Объявлений пока нет</p>
          <p className="mt-1 text-[13px] leading-4 text-muted">
            {isDirector ? "Зажми кнопку и начни со слова «всем»" : "Здесь появятся объявления директора и «Ознакомился» под каждым"}
          </p>
        </div>
      ) : (
        <EtherSection variant="page" />
      )}
    </main>
  );
}
