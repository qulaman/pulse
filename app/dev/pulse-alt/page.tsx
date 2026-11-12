import Link from "next/link";

import { CONCEPT as CLAUDE } from "./claude/concept";
import { STATES } from "./fixtures";
import { CONCEPT as OWN } from "./own/concept";
import { CONCEPT as STRICT } from "./strict/concept";

const ENTRIES = [
  { n: 1, brief: "Ультра-корпоративный: дерзкий, строгий, стильный", concept: STRICT },
  { n: 2, brief: "Современный, как дизайн-система Claude", concept: CLAUDE },
  { n: 3, brief: "Свой вариант — придуман с нуля", concept: OWN },
];

/**
 * /dev/pulse-alt — the redesign contest for Пульс (dev only): three independent entries on the
 * same fixtures, each with every state one tap away. The real /pulse is untouched.
 */
export default function ContestPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8" style={{ background: "#0E0F11", color: "#ECECEC", minHeight: "100dvh" }}>
      <h1 className="text-[28px] font-bold leading-8">Конкурс: новый Пульс</h1>
      <p className="mt-2 text-[15px] leading-5" style={{ color: "#A0A0A6" }}>
        Три версии главного экрана директора на одних и тех же данных. Открывайте на телефоне или в эмуляции iPhone (F12 → значок телефона).
        Любое состояние — ссылкой ниже, дальше всё нажимается.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {ENTRIES.map(({ n, brief, concept }) => (
          <section key={concept.slug} className="rounded-2xl p-5" style={{ background: "#17181B", border: "1px solid #26272B" }}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[22px] font-bold leading-7">
                №{n} · {concept.name}
              </h2>
              <Link href={`/dev/pulse-alt/${concept.slug}`} className="shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold" style={{ background: "#ECECEC", color: "#0E0F11" }}>
                Открыть ›
              </Link>
            </div>
            <p className="mt-1 text-[13px] uppercase tracking-wide" style={{ color: "#7C7C84" }}>
              {brief}
            </p>
            <p className="mt-3 text-[16px] leading-[22px]">{concept.tagline}</p>
            <ul className="mt-3 flex flex-col gap-1 text-[14px] leading-5" style={{ color: "#C4C4CA" }}>
              {concept.principles.map((line) => (
                <li key={line}>— {line}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {concept.palette.map((hex) => (
                <span key={hex} title={hex} className="h-5 w-5 rounded-full" style={{ background: hex, border: "1px solid #3A3B40" }} />
              ))}
              <span className="ml-2 text-[12px]" style={{ color: "#7C7C84" }}>
                {concept.type}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {STATES.map((state) => (
                <Link
                  key={state.id}
                  href={`/dev/pulse-alt/${concept.slug}?state=${state.id}`}
                  title={state.title}
                  className="rounded-full px-2.5 py-1 text-[12px]"
                  style={{ background: "#202125", color: "#C4C4CA" }}
                >
                  {state.title}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
