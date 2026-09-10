import { SettingsForm } from "@/components/settings/SettingsForm";

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Настройки</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Всё здесь — конфигурация компании: код одинаков для всех клиентов
      </p>
      <div className="mt-5">
        <SettingsForm />
      </div>
    </main>
  );
}
