"use client";

import { CircleHelp, Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Popover } from "@/components/desk/ui/Popover";

/** A spoken name or a word on the desk: a word on the line, × under the mouse when it may go; quiet with a clock while it waits for the network. */
export function Pill({ label, fresh, waiting, onRemove }: { label: string; fresh?: boolean; waiting?: boolean; onRemove?: () => void }) {
  return (
    <span
      title={waiting ? "Ждёт связи — сохранится само" : undefined}
      className={`dict-pill inline-flex h-6 max-w-full items-center whitespace-nowrap text-[14px] leading-5 ${waiting ? "text-muted" : fresh ? "text-accent" : ""}`}
      data-fresh={fresh ? "" : undefined}
      data-waiting={waiting ? "" : undefined}
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
          className="dict-pill-x flex h-5 w-4 shrink-0 items-center justify-center text-muted opacity-0 transition-opacity duration-[120ms] hover:text-danger focus-visible:opacity-100 [.desk-row:hover_&]:opacity-100 [.desk-row[aria-selected=true]_&]:opacity-100"
        >
          <X size={12} strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

/** A form the app would add by itself: the director's move, in the pen — one click takes it. */
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
      className="dict-offer inline-flex h-6 items-center gap-1 whitespace-nowrap text-[14px] leading-5 text-accent hover:underline disabled:opacity-40"
    >
      <Plus size={13} strokeWidth={2.5} aria-hidden />
      {label}
    </button>
  );
}

/**
 * A strip over a table: a label with its count and a line of what for on the left, the work on the
 * right or under it — no box, it stands on the sheet over the table's rule. «Проверить имя», «Из
 * ваших записей», «Часто встречается» live here, above the table they feed, not in a column beside it.
 */
export function Strip({ title, count, about, children, testId }: { title: string; count?: number; about?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="dict-strip desk-fields" data-testid={testId} aria-label={title}>
      <div className="dict-strip-head flex items-baseline gap-2">
        <h2 className="dict-strip-title desk-label uppercase">{title}</h2>
        {count ? <span className="dict-strip-count nums text-[12px] leading-4 text-muted">{count}</span> : null}
        {about ? <p className="min-w-0 truncate text-[13px] leading-[18px] text-muted">{about}</p> : null}
      </div>
      <div className="dict-strip-body mt-0.5">{children}</div>
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
        className="dict-guide inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] leading-5 text-muted transition-colors duration-[120ms] hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
      >
        <CircleHelp size={15} strokeWidth={2} aria-hidden className="dict-guide-icon" />
        Как это работает
      </button>
      <Popover open={Boolean(anchor)} onClose={() => setAnchor(null)} anchor={anchor} align="end" width={420} label="Как это работает">
        <ol className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-2.5">
              <span aria-hidden className="dict-step nums w-4 shrink-0 text-[13px] leading-[18px] text-muted">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-[18px]">{step.title}</p>
                <p className="mt-0.5 text-[13px] leading-[18px] text-muted">{step.body}</p>
                {step.examples?.length ? (
                  <p className="mt-0.5 text-[13px] leading-[18px]">{step.examples.join(" · ")}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </Popover>
    </>
  );
}
