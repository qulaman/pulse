"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";

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

const TONES: (Tone | "none")[] = ["accent", "ok", "warn", "danger", "none"];

function Sandbox() {
  const v = useSearchParams().get("v") ?? "tasks";
  const key = v in VARIANTS ? v : "tasks";
  const variant = VARIANTS[key];
  const [override, setOverride] = useState<Tone | "none" | null>(null);
  const tone = override === "none" ? undefined : (override ?? variant.tone);
  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-24">
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
            className={`rounded-full px-3 py-1.5 text-[13px] ${(tone ?? "none") === t ? "bg-text/15 text-text" : "bg-surface-2 text-muted"}`}
          >
            {t}
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
 * /dev/heads?v=tasks|calendar|team|mine|settings|person|task — the screen head of D-113 and
 * D-117 over a long page, with a switch of the state's light (dev only).
 */
export default function HeadsSandboxPage() {
  return (
    <Suspense>
      <Sandbox />
    </Suspense>
  );
}
