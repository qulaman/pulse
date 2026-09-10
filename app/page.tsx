import Link from "next/link";

import { Mascot } from "@/components/brand/Mascot";
import { PulseMark } from "@/components/brand/PulseMark";

const STEPS = [
  { title: "Скажи", text: "Зажми кнопку и скажи: «Марату подготовить КП по Казхрому до завтра». Или напиши одной строкой." },
  { title: "Проверь", text: "Ассистент разберёт, кому, что и к какому сроку. Одно касание — и задача ушла." },
  { title: "Смотри", text: "Кто принял, кто спрашивает, что просрочено — на одном экране, в реальном времени." },
];

/**
 * The front door for a visitor without a session. A signed-in person never sees it:
 * the proxy sends them to the screen of their role.
 */
export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 pb-10 pt-8">
      <header className="flex items-center justify-between">
        <PulseMark />
        <Link href="/login" className="text-[14px] font-medium text-accent">
          Войти
        </Link>
      </header>

      <section className="card-in mt-12 flex flex-col items-start">
        <Mascot state="happy" size={96} />
        <h1 className="mt-6 text-[32px] font-bold leading-9 tracking-tight">
          Голосовое управление компанией
        </h1>
        <p className="mt-3 text-[16px] leading-[22px] text-muted">
          Директор говорит — сотрудники получают задачи, отчитываются и видят, что важно. Без чатов, таблиц и напоминалок.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-[12px] bg-accent px-6 text-[16px] font-semibold text-bg transition-transform duration-[120ms] active:scale-[0.98]"
        >
          Открыть Pulse
        </Link>
      </section>

      <section className="mt-12 grid gap-3">
        {STEPS.map((step, index) => (
          <div key={step.title} className="card-in flex gap-3 rounded-[16px] border border-border bg-surface p-4">
            <span className="nums flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[16px] font-semibold">
              {index + 1}
            </span>
            <div>
              <p className="text-[16px] font-semibold leading-[22px]">{step.title}</p>
              <p className="mt-1 text-[14px] leading-[18px] text-muted">{step.text}</p>
            </div>
          </div>
        ))}
      </section>

      <p className="mt-auto pt-12 text-[13px] leading-4 text-muted">
        Доступ выдаёт директор компании. Работает на телефоне: добавь на главный экран.
      </p>
    </main>
  );
}
