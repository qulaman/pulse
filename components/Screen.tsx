import type { ReactNode } from "react";

import { PageHead } from "@/components/ui/PageHead";

/** Screen shell: fixed side padding of 16 and the screen head (DESIGN section 2, D-109). */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-6">
      <PageHead title={title} />
      <div className="mt-4 text-[16px] leading-[22px] text-muted">{children}</div>
    </main>
  );
}
