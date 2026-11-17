"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type CSSProperties, type ReactNode } from "react";

import { HeadButton } from "@/components/ui/HeadButton";
import { PageHead } from "@/components/ui/PageHead";
import type { Tone } from "@/lib/tasks/tone";

const DATE = "четверг, 24 сентября";

type Variant = {
  title: string;
  tone?: Tone;
  state?: string;
  sub?: string;
  eyebrow?: string;
  back?: { label: string; href: string };
  bare?: boolean;
  actions?: ReactNode;
};

const VARIANTS: Record<string, Variant> = {
  tasks: { title: "Задачи", tone: "warn", eyebrow: DATE, actions: <HeadButton label="Поиск" icon="search" /> },
  calendar: {
    title: "Календарь",
    tone: "accent",
    eyebrow: DATE,
    actions: (
      <>
        <HeadButton label="Убрать со стены" icon="tv" live />
        <HeadButton label="Новое мероприятие" icon="plus" tone="accent" />
      </>
    ),
  },
  team: {
    title: "Команда",
    tone: "danger",
    state: "9 на месте · 3 задачи в работе · 1 просроч.",
    back: { label: "Назад", href: "/dev/heads" },
    actions: <HeadButton label="Добавить" icon="plus" tone="accent" />,
  },
  mine: { title: "Мои дела", tone: "ok", eyebrow: DATE },
  settings: { title: "Настройки" },
  person: {
    title: "Константин Жумабаевич",
    sub: "Менеджер по снабжению",
    back: { label: "Команда", href: "/dev/heads" },
    actions: <HeadButton label="Показать на экране" icon="tv" />,
  },
  task: { title: "", bare: true, back: { label: "Назад", href: "/dev/heads" }, actions: <HeadButton label="Все действия" icon="more" /> },
};

// «muted» — a screen with a state, quiet now; «iris» — a screen with no state (no tone, D-176)
const TONES: (Tone | "iris")[] = ["accent", "ok", "warn", "danger", "muted", "iris"];
// `--sky-tempo` multiplies every period of the sky's lights: below 1 is faster
const TEMPOS: { label: string; value: number }[] = [
  { label: "медленнее", value: 1.6 },
  { label: "как есть", value: 1 },
  { label: "быстрее", value: 0.6 },
];

function Sandbox() {
  const params = useSearchParams();
  const v = params.get("v") ?? "tasks";
  const key = v in VARIANTS ? v : "tasks";
  const variant = VARIANTS[key];
  const [override, setOverride] = useState<Tone | "iris" | null>(() => {
    const t = params.get("tone");
    return TONES.includes(t as Tone | "iris") ? (t as Tone | "iris") : null;
  });
  const [tempo, setTempo] = useState(() => Math.min(4, Math.max(0.25, Number(params.get("tempo")) || 1)));
  const tone = override === "iris" ? undefined : (override ?? variant.tone);
  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-24" style={{ "--sky-tempo": tempo } as CSSProperties}>
      <PageHead
        key={key}
        title={variant.title || undefined}
        tone={tone}
        state={variant.state}
        sub={variant.sub}
        eyebrow={variant.eyebrow}
        back={variant.back}
        bare={variant.bare}
        actions={variant.actions}
      />
      <div className="status-screen mt-3 h-[150px] rounded-[22px]" />
      <nav className="mt-4 flex flex-wrap gap-2">
        {Object.keys(VARIANTS).map((k) => (
          <Link
            key={k}
            href={`/dev/heads?v=${k}`}
            onClick={() => setOverride(null)}
            className={`rounded-full px-3 py-1.5 text-[13px] ${k === key ? "bg-accent/20 text-accent" : "bg-surface-2 text-muted"}`}
          >
            {k}
          </Link>
        ))}
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted">тон:</span>
        {TONES.map((t) => (
          <button
            key={t}
            type="button"
            data-testid={`tone-${t}`}
            onClick={() => setOverride(t)}
            className={`rounded-full px-3 py-1.5 text-[13px] ${(tone ?? "iris") === t ? "bg-text/15 text-text" : "bg-surface-2 text-muted"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted">темп:</span>
        {TEMPOS.map((t) => (
          <button
            key={t.value}
            type="button"
            data-testid={`tempo-${t.value}`}
            onClick={() => setTempo(t.value)}
            className={`rounded-full px-3 py-1.5 text-[13px] ${tempo === t.value ? "bg-text/15 text-text" : "bg-surface-2 text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className="task-card mt-2 h-[76px] rounded-[18px]" />
      ))}
    </main>
  );
}

/**
 * /dev/heads?v=tasks|calendar|team|mine|settings|person|task[&tone=…][&tempo=…] — the screen
 * head of D-113 and D-117 over a long page, with a switch of the state's light, the shimmer of
 * a screen with no state and the tempo of the sky's lights (D-176; dev only).
 */
export default function HeadsSandboxPage() {
  return (
    <Suspense>
      <Sandbox />
    </Suspense>
  );
}
