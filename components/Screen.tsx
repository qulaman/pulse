import type { ReactNode } from "react";

/** Screen shell: fixed side padding of 16 and a title in h1 (DESIGN section 2). */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <h1 className="text-[24px] font-bold leading-[30px]">{title}</h1>
      <div className="mt-4 text-[16px] leading-[22px] text-muted">{children}</div>
    </main>
  );
}
