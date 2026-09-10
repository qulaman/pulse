import { Mascot } from "@/components/brand/Mascot";

/** Эфир: announcements for everybody (docs/CONCEPT.md §3.1). The rating has its own tab now. */
export default function EtherPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Эфир</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">Объявления директора для всей компании</p>
      <div className="mt-6 flex flex-col items-center rounded-[16px] border border-border bg-surface px-6 py-10 text-center">
        <Mascot state="calm" size={72} />
        <p className="mt-4 text-[16px] leading-[22px]">Объявлений пока нет</p>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          Скажи «всем: …» — объявление появится здесь, а под ним «Ознакомился» от каждого
        </p>
      </div>
    </main>
  );
}
