"use client";

import { useState, type ReactNode } from "react";

import { SparkIcon } from "@/components/settings/icons";

const STORAGE = "pulse:dictionary-guide:";

export type GuideStep = { title: string; body: ReactNode; examples?: string[] };

/**
 * The instructions on top of a dictionary tab (D-111): numbered steps with examples in
 * the shape they are typed. Open until «Понятно»; after that one line that opens them
 * again — per browser, a convenience only (the page works the same without storage).
 * Mounted after the data arrives, so reading storage in the initial state never meets
 * a server render.
 */
export function Guide({ id, steps }: { id: string; steps: GuideStep[] }) {
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE + id) !== "closed";
    } catch {
      return true;
    }
  });
  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE + id, next ? "open" : "closed");
    } catch {
      // storage off: the guide simply opens again next time
    }
  };

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => toggle(!open)}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[120ms] active:bg-surface-2"
      >
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}
        >
          <SparkIcon />
        </span>
        <span className="min-w-0 flex-1 font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]">
          Как это работает
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden
          className="shrink-0 text-muted transition-transform duration-[120ms] ease-out"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          <polyline points="6,3.5 10.5,8 6,12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div className="card-in border-t border-border/70 px-4 pb-4 pt-3">
          <ol className="flex flex-col gap-3.5">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span
                  aria-hidden
                  className="nums mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                  style={{ background: "var(--surface-2)", color: "var(--accent)" }}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-5">{step.title}</p>
                  <p className="mt-0.5 text-[14px] leading-5 text-muted">{step.body}</p>
                  {step.examples?.length ? (
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      {step.examples.map((example) => (
                        <span
                          key={example}
                          className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[13px] leading-[18px] text-text"
                        >
                          {example}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => toggle(false)}
            className="mt-4 min-h-[40px] font-display text-[14px] font-semibold text-accent"
          >
            Понятно, свернуть
          </button>
        </div>
      ) : null}
    </section>
  );
}
