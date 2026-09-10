import Link from "next/link";

import { Mascot } from "@/components/brand/Mascot";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      <Mascot state="calm" size={88} />
      <h1 className="mt-5 text-[24px] font-bold leading-[30px]">Такой страницы нет</h1>
      <p className="mt-2 text-[16px] leading-[22px] text-muted">Возможно, ссылка устарела</p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-[44px] items-center rounded-[12px] bg-accent px-5 text-[14px] font-semibold text-bg"
      >
        На главную
      </Link>
    </main>
  );
}
