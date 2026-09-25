import Link from "next/link";

import { CostReport } from "@/components/lab/CostReport";
import { LabPanel } from "@/components/lab/LabPanel";
import { LabTabs } from "@/components/lab/LabTabs";
import { PageHead } from "@/components/ui/PageHead";
import type { LabTab } from "@/lib/lab/tabs";

/**
 * «Лаборатория» (D-63). The server adds nothing but the tab from the address, so the route's
 * skeleton is this same screen on its first tab — every panel draws its own waiting (D-122).
 */
export function LabScreen({ tab }: { tab: LabTab }) {
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
