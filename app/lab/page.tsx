import { LabPanel } from "@/components/lab/LabPanel";

export default function LabPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Лаборатория</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Модели распознавания и разбора, и что стоило каждое распознавание директора
      </p>
      <div className="mt-4">
        <LabPanel />
      </div>
    </main>
  );
}
