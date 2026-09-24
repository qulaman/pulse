import Link from "next/link";

import { HeadButton } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";

const DATE = "четверг, 24 сентября";

const HEADS = {
  tasks: <PageHead eyebrow={DATE} title="Задачи" actions={<HeadButton label="Поиск" icon="search" />} />,
  calendar: (
    <PageHead
      eyebrow={DATE}
      title="Календарь"
      actions={
        <>
          <HeadButton label="На стену" icon="tv" live />
          <HeadButton label="Новое" icon="plus" tone="accent" />
        </>
      }
    />
  ),
  search: <PageHead eyebrow={DATE} title="Заметки" actions={<HeadButton label="Закрыть поиск" icon="close" pressed />} />,
  board: (
    <PageHead back={{ href: "/dev/heads", label: "Заметки" }} title="План на квартал и длинное имя доски" actions={<HeadButton label="На стену" icon="wall" />} />
  ),
  team: <PageHead title="Команда" sub="9 на месте · 3 задачи в работе · 1 просроч." actions={<HeadButton label="Добавить" icon="plus" tone="accent" href="/dev/heads" />} />,
  settings: <PageHead title="Настройки" />,
  task: <PageHead bare back={{ href: "/dev/heads", label: "Назад" }} actions={<HeadButton label="Все действия" icon="more" />} />,
} as const;

type Key = keyof typeof HEADS;

/** /dev/heads?v=tasks|calendar|search|board|team|settings|task — one screen head over a long page (dev only, D-113). */
export default async function HeadsSandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { v } = await searchParams;
  const key: Key = v && v in HEADS ? (v as Key) : "tasks";
  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-24">
      {HEADS[key]}
      <div className="status-screen mt-3 h-[150px] rounded-[22px]" />
      <nav className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(HEADS) as Key[]).map((k) => (
          <Link key={k} href={`/dev/heads?v=${k}`} className={`rounded-full px-3 py-1.5 text-[13px] ${k === key ? "bg-accent/20 text-accent" : "bg-surface-2 text-muted"}`}>
            {k}
          </Link>
        ))}
      </nav>
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className="task-card mt-2 h-[76px] rounded-[18px]" />
      ))}
    </main>
  );
}
