import Link from "next/link";

import { SettingsForm } from "@/components/settings/SettingsForm";

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Настройки</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Всё здесь — конфигурация компании: код одинаков для всех клиентов
      </p>
      <Link
        href="/people"
        className="mt-5 flex min-h-[52px] items-center justify-between gap-3 rounded-[16px] border border-border bg-surface px-4 text-[16px] leading-[22px]"
      >
        Сотрудники
        <span className="text-[13px] leading-4 text-muted">карточки, алиасы, роли ›</span>
      </Link>
      <div className="mt-4">
        <SettingsForm />
      </div>
    </main>
  );
}
