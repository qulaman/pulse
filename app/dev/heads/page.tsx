import { AppHeader } from "@/components/AppHeader";
import { HeadButton } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";

const DATE = "среда, 23 сентября";

/** /dev/heads?v=N — the screen heads of D-109 over a stand-in of the screen below (dev only). */
export default async function HeadsSandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { v = "all" } = await searchParams;
  const heads = [
    <PageHead key="tasks" eyebrow={DATE} title="Задачи" actions={<HeadButton label="Поиск" icon="search" />} />,
    <PageHead
      key="calendar"
      eyebrow={DATE}
      title="Календарь"
      actions={
        <>
          <HeadButton label="На стену" icon="tv" live />
          <HeadButton label="Новое" icon="plus" tone="accent" />
        </>
      }
    />,
    <PageHead key="notes" eyebrow={DATE} title="Заметки" actions={<HeadButton label="Закрыть поиск" icon="close" pressed />} />,
    <PageHead
      key="board"
      back={{ href: "/notes", label: "Заметки · доски" }}
      title="План на квартал и длинное имя доски"
      actions={<HeadButton label="На стену" icon="wall" />}
    />,
    <PageHead key="team" title="Команда" sub="9 на месте · 3 задачи в работе · 1 просроч." actions={<HeadButton label="Добавить" icon="plus" tone="accent" href="/people/new" />} />,
    <PageHead key="settings" title="Настройки" sub="Всё здесь — конфигурация компании: код одинаков для всех клиентов" />,
    <PageHead key="new" back={{ href: "/settings", label: "Сотрудники" }} title="Новый сотрудник" />,
    <PageHead key="shop" title="Магазин" />,
  ];
  const shown = v === "all" ? heads : [heads[Number(v)]];
  return (
    <>
      <AppHeader fullName="Тест Тестов" />
      {shown.map((head, i) => (
        <main key={i} className="mx-auto w-full max-w-lg px-4 pb-6 pt-3">
          {head}
          <div className="status-screen mt-2 h-[92px] rounded-[22px]" />
        </main>
      ))}
    </>
  );
}
