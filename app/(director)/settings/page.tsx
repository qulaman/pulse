import Link from "next/link";

import { CompanyForm } from "@/components/settings/CompanyForm";
import { DemoReset } from "@/components/settings/DemoReset";
import { SettingsForm } from "@/components/settings/SettingsForm";

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Настройки</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Всё здесь — конфигурация компании: код одинаков для всех клиентов
      </p>
      <h2 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-muted">Компания</h2>
      <Link
        href="/people"
        className="mt-2 flex min-h-[52px] items-center justify-between gap-3 card px-4 text-[16px] leading-[22px]"
      >
        Команда
        <span className="text-[13px] leading-4 text-muted">карточки, алиасы, роли ›</span>
      </Link>
      <Link
        href="/shop"
        className="mt-2 flex min-h-[52px] items-center justify-between gap-3 card px-4 text-[16px] leading-[22px]"
      >
        Магазин
        <span className="text-[13px] leading-4 text-muted">награды и выдача ›</span>
      </Link>
      <Link
        href="/admin"
        className="mt-2 flex min-h-[52px] items-center justify-between gap-3 card px-4 text-[16px] leading-[22px]"
      >
        Данные
        <span className="text-[13px] leading-4 text-muted">таблицы компании как есть ›</span>
      </Link>
      <Link
        href="/sent"
        className="mt-2 flex min-h-[52px] items-center justify-between gap-3 card px-4 text-[16px] leading-[22px]"
      >
        Задачи
        <span className="text-[13px] leading-4 text-muted">все поручения списком ›</span>
      </Link>
      <Link
        href="/screen"
        className="mt-2 flex min-h-[52px] items-center justify-between gap-3 card px-4 text-[16px] leading-[22px]"
      >
        Экран
        <span className="text-[13px] leading-4 text-muted">пульт от телевизора ›</span>
      </Link>
      <Link
        href="/calendar"
        className="mt-2 flex min-h-[52px] items-center justify-between gap-3 card px-4 text-[16px] leading-[22px]"
      >
        Календарь
        <span className="text-[13px] leading-4 text-muted">мероприятия и участники ›</span>
      </Link>
      <Link
        href="/secretary"
        className="mt-2 flex min-h-[52px] items-center justify-between gap-3 card px-4 text-[16px] leading-[22px]"
      >
        Заявки
        <span className="text-[13px] leading-4 text-muted">кофе, врач, «зайди ко мне» ›</span>
      </Link>
      <div className="mt-4">
        <CompanyForm />
      </div>
      <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">Голос и разбор</h2>
      <div className="mt-2">
        <SettingsForm />
      </div>
      {/* a demo instance only: the value is inlined at build time, a client's prod never sets it */}
      {process.env.NEXT_PUBLIC_DEMO_MODE === "1" ? (
        <>
          <h2 className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">Демо</h2>
          <div className="mt-2">
            <DemoReset />
          </div>
        </>
      ) : null}
    </main>
  );
}
