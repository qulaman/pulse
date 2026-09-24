import Link from "next/link";

import { CostReport } from "@/components/lab/CostReport";
import { LabPanel } from "@/components/lab/LabPanel";
import { LabTabs } from "@/components/lab/LabTabs";
import { PageHead } from "@/components/ui/PageHead";
import { parseLabTab } from "@/lib/lab/tabs";

export default async function LabPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const tab = parseLabTab((await searchParams).tab);
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Лаборатория" />
      <LabTabs
        key={tab}
        initialTab={tab}
        panels={{
          models: (
            <>
              <Link href="/lab/mascot" className="card flex min-h-[44px] items-center justify-between gap-3 p-4">
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
            </>
          ),
          costs: <CostReport />,
        }}
      />
    </main>
  );
}
