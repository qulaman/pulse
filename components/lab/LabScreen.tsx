import Link from "next/link";

import { CostReport } from "@/components/lab/CostReport";
import { LabForAllRow } from "@/components/lab/LabForAllRow";
import { LabPanel } from "@/components/lab/LabPanel";
import { LabTabs } from "@/components/lab/LabTabs";
import { ParserPanel } from "@/components/lab/ParserPanel";
import { PageHead } from "@/components/ui/PageHead";
import type { LabTab } from "@/lib/lab/tabs";

/** The lab's pages anyone who gets in may open: no bench here writes the company's settings. */
const SHELF: { href: string; title: string; note: string }[] = [
  { href: "/lab/about", title: "Как работает Pulse", note: "Продукт за пять минут: как устроен, в чём секрет, что даёт" },
  { href: "/lab/tech", title: "Технология", note: "Путь голосового через систему: узлы, данные, сбои" },
  { href: "/lab/mascot", title: "Анимации маскота", note: "Все состояния, жесты и сцены «Капли» на одной полке" },
  { href: "/lab/haptics", title: "Вибрация", note: "Какой способ тикает на iPhone — проверка на своём телефоне" },
];

function Shelf() {
  return (
    <div className="flex flex-col gap-3">
      {SHELF.map((page) => (
        <Link key={page.href} href={page.href} className="card flex min-h-[44px] items-center justify-between gap-3 p-4">
          <span>
            <span className="block text-[16px] font-semibold leading-[22px]">{page.title}</span>
            <span className="block text-[13px] leading-4 text-muted">{page.note}</span>
          </span>
          <span aria-hidden className="text-[18px] text-muted">
            ›
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * «Лаборатория» (D-63). The server adds nothing but the tab from the address and the role, so
 * the route's skeleton is this same screen on its first tab — every panel draws its own
 * waiting (D-122). `admin` — the director and the secretary: the benches, and the switch that
 * opens the lab to the team while the company tests (D-150); the team gets the shelf alone.
 */
export function LabScreen({ tab, admin = true }: { tab: LabTab; admin?: boolean }) {
  if (!admin) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
        <PageHead title="Лаборатория" />
        <p className="mb-4 text-[15px] leading-[22px] text-muted">
          Пока идёт тестирование, лаборатория открыта всей команде: проверьте вибрацию на своём телефоне и посмотрите, как устроен продукт.
        </p>
        <Shelf />
      </main>
    );
  }
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Лаборатория" />
      <LabTabs
        key={tab}
        initialTab={tab}
        panels={{
          models: (
            <>
              <LabForAllRow />
              <Shelf />
              <div className="mt-4">
                <LabPanel />
              </div>
            </>
          ),
          parser: <ParserPanel />,
          costs: <CostReport />,
        }}
      />
    </main>
  );
}
