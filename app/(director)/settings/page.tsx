import Link from "next/link";

import { CompanyForm } from "@/components/settings/CompanyForm";
import { SettingsForm } from "@/components/settings/SettingsForm";

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Настройки</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Всё здесь — конфигурация компании: код одинаков для всех клиентов
      </p>
      <h2 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-muted">Компания</h2>
      <div className="mt-2 mb-2">
        <CompanyForm />
      </div>
      <Link
        href="/people"
        className="mt-2 flex min-h-[52px] items-center justify-between gap-3 rounded-[16px] border border-border bg-surface px-4 text-[16px] leading-[22px]"
      >
        Сотрудники
        <span className="text-[13px] leading-4 text-muted">карточки, алиасы, роли ›</span>
      </Link>
      <Link
        href="/admin"
        className="mt-2 flex min-h-[52px] items-center justify-between gap-3 rounded-[16px] border border-border bg-surface px-4 text-[16px] leading-[22px]"
      >
        Данные
        <span className="text-[13px] leading-4 text-muted">таблицы компании как есть ›</span>
      </Link>
      <Link
        href="/sent"
        className="mt-2 flex min-h-[52px] items-center justify-between gap-3 rounded-[16px] border border-border bg-surface px-4 text-[16px] leading-[22px]"
      >
        Отправленные
        <span className="text-[13px] leading-4 text-muted">все поручения по дням ›</span>
      </Link>
      <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">Голос и разбор</h2>
      <div className="mt-2">
        <SettingsForm />
      </div>
    </main>
  );
}
