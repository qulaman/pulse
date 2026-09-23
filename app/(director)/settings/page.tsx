import { CompanyForm } from "@/components/settings/CompanyForm";
import { DemoReset } from "@/components/settings/DemoReset";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { CupIcon, ListIcon, PeopleIcon, TableIcon } from "@/components/settings/icons";
import { Row, RowGroup } from "@/components/ui/Row";

/** Магазин наград — свой значок здесь же: иконки настроек живут отдельным файлом. */
const GiftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2.8" y="8.4" width="14.4" height="8.4" rx="1.4" />
    <path d="M2 6.2h16v2.2H2zM10 6.2v10.6" />
    <path d="M10 6.2C8.6 6.2 6.4 6 6 4.6A1.8 1.8 0 0 1 8.4 2.6c1.2.5 1.6 2.3 1.6 3.6zM10 6.2c1.4 0 3.6-.2 4-1.6A1.8 1.8 0 0 0 11.6 2.6C10.4 3.1 10 4.9 10 6.2z" />
  </svg>
);

/** Пульт от телевизора — свой значок здесь же: иконки настроек живут отдельным файлом. */
const TvIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2.6" y="3.6" width="14.8" height="10" rx="1.6" />
    <path d="M7 16.4h6M10 13.6v2.8" />
  </svg>
);

/** Календарь — свой значок здесь же: иконки настроек живут отдельным файлом. */
const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2.8" y="4.4" width="14.4" height="12" rx="1.6" />
    <path d="M6.8 2.6v3.6M13.2 2.6v3.6M2.8 8.6h14.4" />
  </svg>
);

/**
 * Настройки: everything that makes this instance this company. The screen is a list of
 * closed sections, each saying its current value in one line — the director scans it and
 * opens the one thing they came for, instead of scrolling a wall of fields.
 */
export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-4">
      <h1 className="text-[24px] font-bold leading-[30px]">Настройки</h1>
      <p className="mt-1 text-[13px] leading-[18px] text-muted">
        Всё здесь — конфигурация компании: код одинаков для всех клиентов
      </p>

      <h2 className="eyebrow mt-6 px-1">Компания</h2>
      <div className="mt-2">
        <CompanyForm />
      </div>
      <RowGroup className="mt-2">
        <Row icon={<PeopleIcon />} title="Команда" value="алиасы и роли" href="/people" />
        <Row icon={<ListIcon />} title="Задачи" value="весь список" href="/sent" />
        <Row icon={<GiftIcon />} title="Магазин" value="награды и выдача" href="/shop" />
        <Row icon={<TvIcon />} title="Экран" value="пульт от телевизора" href="/screen" />
        <Row icon={<CalendarIcon />} title="Календарь" value="мероприятия и участники" href="/calendar" />
        <Row icon={<CupIcon />} title="Заявки" value="кофе, врач, «зайди ко мне»" href="/secretary" />
        <Row icon={<TableIcon />} title="Данные" value="таблицы как есть" href="/admin" />
      </RowGroup>

      <h2 className="eyebrow mt-6 px-1">Правила работы</h2>
      <div className="mt-2">
        <SettingsForm />
      </div>

      {/* a demo instance only: the value is inlined at build time, a client's prod never sets it */}
      {process.env.NEXT_PUBLIC_DEMO_MODE === "1" ? (
        <>
          <h2 className="eyebrow mt-6 px-1">Демо</h2>
          <div className="mt-2">
            <DemoReset />
          </div>
        </>
      ) : null}
    </main>
  );
}
