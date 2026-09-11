import Link from "next/link";

import { Mascot } from "@/components/brand/Mascot";
import { PulseMark } from "@/components/brand/PulseMark";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const STEPS = [
  {
    title: "Скажи",
    text: "Зажми кнопку: «Марату подготовить КП по Казхрому до завтра». Или напиши одной строкой.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...STROKE} aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    ),
  },
  {
    title: "Проверь",
    text: "Ассистент разберёт, кому, что и к какому сроку. Одно касание, и задача ушла.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...STROKE} aria-hidden>
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    ),
  },
  {
    title: "Смотри",
    text: "Кто принял, кто спрашивает, что просрочено. На одном экране, в реальном времени.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" {...STROKE} aria-hidden>
        <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.8" />
      </svg>
    ),
  },
];

const PROMISES = [
  { title: "Голосовое не теряется", text: "Запись сохраняется раньше любой обработки и остаётся у адресата." },
  { title: "Квитанции, а не догадки", text: "Отправлено, увидел, принял. С точным временем, без «наверное, не получил»." },
  { title: "Данные только ваши", text: "У каждой компании свой экземпляр и своя база. Ничего общего с другими." },
];

/** The voice bubble's static waveform: heights in px, quiet at the edges. */
const WAVE = [6, 10, 16, 9, 18, 12, 20, 8, 14, 17, 7, 12, 5];

/** The three receipt states of principle 8, with the times of the demo morning. */
const RECEIPT = [
  { label: "отправлено", time: "9:02", tone: "muted" },
  { label: "увидел", time: "9:10", tone: "muted" },
  { label: "принял", time: "9:14", tone: "ok" },
] as const;

/**
 * The front door for a visitor without a session. A signed-in person never sees it:
 * the proxy sends them to the screen of their role. Phone-first: the first screen
 * fits an iPhone SE, the primary button sits under the thumb.
 */
export default function LandingPage() {
  return (
    <main className="landing relative mx-auto flex w-full max-w-[430px] flex-col px-5 pb-8">
      {/* aurora: one static radial wash behind the hero, no filter, no animation */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]"
        style={{
          background:
            "radial-gradient(90% 55% at 50% 12%, color-mix(in srgb, var(--accent) 11%, transparent), transparent 75%)",
        }}
      />

      <header
        className="flex items-center justify-between"
        style={{ paddingTop: "calc(12px + env(safe-area-inset-top))" }}
      >
        <PulseMark />
        <Link
          href="/login"
          className="inline-flex min-h-[44px] items-center rounded-[12px] border border-border px-4 text-[14px] font-medium leading-[18px] text-text transition-transform duration-[120ms] active:scale-[0.98]"
        >
          Войти
        </Link>
      </header>

      {/* ---- hero: fits the first screen of a phone ------------------------------- */}
      <section className="flex min-h-[calc(100dvh-72px-env(safe-area-inset-top))] flex-col justify-center py-6">
        <div className="hero-in relative flex h-[168px] items-center justify-center">
          {/* the cardiomonitor line draws itself once across the hero */}
          <svg
            className="absolute inset-x-[-20px] top-1/2 h-[64px] w-[calc(100%+40px)] -translate-y-1/2"
            viewBox="0 0 400 64"
            preserveAspectRatio="none"
            aria-hidden
          >
            <polyline
              className="pulse-line"
              points="0,32 62,32 74,8 88,56 100,20 110,32 146,32 254,32 296,32 306,18 316,46 324,32 400,32"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity="0.35"
            />
          </svg>
          {/* glow: a radial layer breathing by opacity only */}
          <div
            aria-hidden
            className="glow absolute h-[220px] w-[220px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, color-mix(in srgb, var(--accent) 28%, transparent), transparent 68%)",
            }}
          />
          <div className="relative">
            <Mascot state="calm" size={112} />
          </div>
        </div>

        <h1 className="hero-in mt-6 text-[34px] font-bold leading-[38px] tracking-[-0.02em]" style={{ animationDelay: "80ms" }}>
          Скажи.
          <br />
          Остальное сделает Pulse.
        </h1>
        <p className="hero-in mt-4 text-[16px] leading-[22px] text-muted" style={{ animationDelay: "160ms" }}>
          Директор говорит, сотрудники получают задачи, отчитываются и видят, что важно.
          Без чатов, таблиц и напоминалок.
        </p>

        <div className="hero-in mt-7 flex flex-col gap-3" style={{ animationDelay: "240ms" }}>
          <Link
            href="/login"
            className="inline-flex min-h-[52px] items-center justify-center rounded-[12px] bg-accent px-6 text-[16px] font-semibold text-bg transition-transform duration-[120ms] active:scale-[0.98]"
          >
            Открыть Pulse
          </Link>
          <a
            href="#how"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] text-[14px] font-medium leading-[18px] text-muted"
          >
            Как это работает
            <svg width="16" height="16" viewBox="0 0 24 24" {...STROKE} aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </a>
        </div>
      </section>

      {/* ---- demo: voice → task → receipt ------------------------------------------ */}
      <section aria-label="Пример" className="mt-2">
        <p className="text-[13px] font-medium uppercase leading-4 tracking-[0.08em] text-muted">Так это выглядит</p>
        <div
          className="card-in mt-3 rounded-[16px] border border-border p-4"
          style={{
            background: "linear-gradient(180deg, var(--surface-2), var(--surface) 42%)",
            boxShadow: "var(--shadow-raised)",
            borderTopColor: "color-mix(in srgb, var(--border) 50%, var(--text-muted))",
          }}
        >
          {/* the voice bubble */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <Mascot state="calm" size={32} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex h-5 items-end gap-[3px]" aria-hidden>
                {WAVE.map((h, i) => (
                  <span
                    key={i}
                    className="wave w-[3px] rounded-full bg-accent"
                    style={{ height: h, animationDelay: `${i * 90}ms` }}
                  />
                ))}
              </div>
              <p className="mt-2 text-[16px] leading-[22px]">«Марату подготовить КП по Казхрому до завтра»</p>
              <p className="nums mt-1 text-[13px] leading-4 text-muted">9:02 · голосовое, 4 с</p>
            </div>
          </div>

          {/* the assistant's line */}
          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[13px] leading-4 text-muted">Понял так: 1 задача</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* the task as the employee sees it */}
          <div className="rounded-[12px] border border-border bg-bg p-3">
            <p className="text-[16px] font-semibold leading-[22px]">Подготовить КП по Казхрому</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="nums inline-flex items-center rounded-[12px] border border-border bg-surface-2 px-2.5 py-1 text-[13px] leading-4">
                завтра 13:00
              </span>
              <span className="text-[13px] leading-4 text-muted">Марат Оспанов</span>
            </div>
          </div>

          {/* the receipt strip */}
          <ol className="mt-4 flex items-center" aria-label="Квитанция доставки">
            {RECEIPT.map((step, i) => {
              const color = step.tone === "ok" ? "var(--ok)" : "var(--text-muted)";
              return (
                <li key={step.label} className="flex flex-1 items-center">
                  <div className="flex shrink-0 flex-col items-start">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: color }} />
                    <span className="mt-1.5 text-[13px] leading-4" style={{ color }}>
                      {step.label}
                    </span>
                    <span className="nums text-[13px] leading-4" style={{ color }}>
                      {step.time}
                    </span>
                  </div>
                  {i < RECEIPT.length - 1 ? (
                    <span aria-hidden className="mx-2 mb-9 h-px flex-1" style={{ background: "var(--border)" }} />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ---- how it works: a timeline ----------------------------------------------- */}
      <section id="how" className="mt-12 scroll-mt-6" aria-label="Как это работает">
        <p className="text-[13px] font-medium uppercase leading-4 tracking-[0.08em] text-muted">Как это работает</p>
        <ol className="relative mt-4">
          <span
            aria-hidden
            className="absolute bottom-5 left-[19px] top-5 w-px"
            style={{ background: "color-mix(in srgb, var(--accent) 35%, transparent)" }}
          />
          {STEPS.map((step, index) => (
            <li key={step.title} className="card-in relative flex gap-4 py-4">
              <span
                className="relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-accent"
                aria-hidden
              >
                {step.icon}
              </span>
              <div className="min-w-0 pt-1">
                <p className="text-[19px] font-semibold leading-6">
                  <span className="nums mr-2 text-muted">{index + 1}</span>
                  {step.title}
                </p>
                <p className="mt-1 text-[16px] leading-[22px] text-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---- promises: the principles the product is built on -------------------------- */}
      <section className="mt-10 rounded-[16px] border border-border bg-surface" aria-label="Принципы">
        {PROMISES.map((item, index) => (
          <div key={item.title} className={`px-4 py-4 ${index > 0 ? "border-t border-border" : ""}`}>
            <p className="text-[16px] font-semibold leading-[22px]">{item.title}</p>
            <p className="mt-1 text-[14px] leading-[18px] text-muted">{item.text}</p>
          </div>
        ))}
      </section>

      {/* ---- footer -------------------------------------------------------------- */}
      <footer className="mt-10">
        <Link
          href="/login"
          className="inline-flex min-h-[52px] w-full items-center justify-center rounded-[12px] border border-border bg-surface px-6 text-[16px] font-semibold transition-transform duration-[120ms] active:scale-[0.98]"
        >
          Открыть Pulse
        </Link>
        <div className="mt-6 flex items-start gap-3 text-[13px] leading-4 text-muted">
          <svg width="18" height="18" viewBox="0 0 24 24" {...STROKE} className="mt-px shrink-0" aria-hidden>
            <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
            <path d="M12 8v6M9 11h6" />
          </svg>
          <p>Доступ выдаёт директор компании. Работает на телефоне: добавь на главный экран.</p>
        </div>
        <div className="mt-8 flex items-center justify-between border-t border-border pt-4">
          <PulseMark />
          <span className="text-[13px] leading-4 text-muted">Голосовое управление компанией</span>
        </div>
      </footer>
    </main>
  );
}
