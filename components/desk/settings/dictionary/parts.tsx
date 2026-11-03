"use client";

import { useState, type ReactNode } from "react";

import { Popover } from "@/components/desk/ui/Popover";

/** A spoken name or a word on the desk: a small pill, × when it may go; dashed and with a clock while it waits for the network. */
export function Pill({ label, fresh, waiting, onRemove }: { label: string; fresh?: boolean; waiting?: boolean; onRemove?: () => void }) {
  return (
    <span
      title={waiting ? "Ждёт связи — сохранится само" : undefined}
      className={`inline-flex h-6 max-w-full items-center whitespace-nowrap rounded-full border bg-surface-2 text-[13px] font-medium leading-4 ${
        waiting ? "border-dashed border-muted/60 text-muted" : fresh ? "border-accent/60" : "border-border"
      } ${onRemove ? "pl-2.5" : "px-2.5"}`}
    >
      {waiting ? (
        <svg width="11" height="11" viewBox="0 0 16 16" aria-label="ждёт связи" className="mr-1 shrink-0">
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 4.8V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Убрать «${label}»`}
          title="Убрать"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[14px] leading-none text-muted transition-colors duration-[120ms] hover:bg-bg/60 hover:text-danger"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

/** A form the app would add by itself: dashed, in the accent — one click takes it. */
export function OfferPill({ label, onTake, disabled }: { label: string; onTake: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onTake();
      }}
      disabled={disabled}
      aria-label={`Добавить «${label}»`}
      className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-accent/60 px-2.5 text-[13px] font-medium leading-4 text-accent transition-colors duration-[120ms] hover:bg-accent/10 disabled:opacity-40"
    >
      <span aria-hidden>+</span>
      {label}
    </button>
  );
}

/**
 * A strip over a table: a label with its count and a line of what for on the left, the work on the
 * right or under it — flat, like the table under it. «Проверить имя», «Из ваших записей», «Часто
 * встречается» live here, above the table they feed, not in a narrow column beside it.
 */
export function Strip({ title, count, about, children, testId }: { title: string; count?: number; about?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="rounded-[12px] border border-border bg-surface/40 px-4 py-3" data-testid={testId} aria-label={title}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">{title}</h2>
        {count ? <span className="nums text-[12px] font-semibold leading-4 text-muted/70">{count}</span> : null}
        {about ? <p className="min-w-0 truncate text-[13px] leading-[18px] text-muted">· {about}</p> : null}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export type GuideStep = { title: string; body: string; examples?: string[] };

/** «Как это работает» — the rules of a tab one click away, in a panel under the button; not a card that pushes the table down. */
export function GuideButton({ steps }: { steps: GuideStep[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        aria-expanded={Boolean(anchor)}
        aria-label="Как это работает"
        title="Как это работает"
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
        className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
      >
        <span aria-hidden className="flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-current font-display text-[11px] font-bold">
          ?
        </span>
      </button>
      <Popover open={Boolean(anchor)} onClose={() => setAnchor(null)} anchor={anchor} align="end" width={420} label="Как это работает">
        <ol className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-2.5">
              <span aria-hidden className="nums mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-accent">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-[18px]">{step.title}</p>
                <p className="mt-0.5 text-[13px] leading-[18px] text-muted">{step.body}</p>
                {step.examples?.length ? (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {step.examples.map((example) => (
                      <span key={example} className="rounded-full border border-border bg-surface-2 px-2 text-[12px] leading-5">
                        {example}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Popover>
    </>
  );
}
