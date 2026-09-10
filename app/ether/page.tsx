import { Mascot } from "@/components/brand/Mascot";

/** Эфир arrives with the pilot (docs/CONCEPT.md §7); until then the screen says so honestly. */
export default function EtherPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Эфир</h1>
      <div className="mt-8 flex flex-col items-center rounded-[16px] border border-border bg-surface px-6 py-10 text-center">
        <Mascot state="calm" size={72} />
        <p className="mt-4 text-[16px] leading-[22px]">Объявлений пока нет</p>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          Здесь появятся объявления директора для всех и «Ознакомился» под каждым
        </p>
      </div>
    </main>
  );
}
