import Link from "next/link";

import { LabPanel } from "@/components/lab/LabPanel";

export default function LabPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Лаборатория</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Модели распознавания и разбора, и что стоило каждое распознавание директора
      </p>
      <Link href="/lab/mascot" className="card mt-4 flex min-h-[44px] items-center justify-between gap-3 p-4">
        <span>
          <span className="block text-[16px] font-semibold leading-[22px]">Анимации маскота</span>
          <span className="block text-[13px] leading-4 text-muted">Все состояния, жесты и сцены «Капли» на одной полке</span>
        </span>
        <span aria-hidden className="text-[18px] text-muted">
          ›
        </span>
      </Link>
      <div className="mt-4">
        <LabPanel />
      </div>
    </main>
  );
}
