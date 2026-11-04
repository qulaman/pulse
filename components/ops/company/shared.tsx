"use client";

import { useState, type ReactNode } from "react";

import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";

/** A field of a dialog: the words over the control, an error and a hint under it. */
export function Field({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-medium leading-5 text-muted">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-[12px] font-medium leading-4 text-danger">
          {error}
        </span>
      ) : null}
      {hint ? <span className="text-[12px] leading-4 text-muted">{hint}</span> : null}
    </label>
  );
}

/** One of a few, each with its consequence in plain words under it. */
export function Choice<V extends string>({
  name,
  label,
  value,
  onChange,
  items,
}: {
  name: string;
  label: string;
  value: V | null;
  onChange: (value: V) => void;
  items: { value: V; title: string; hint?: ReactNode }[];
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="sr-only">{label}</legend>
      {items.map((item) => {
        const on = item.value === value;
        return (
          <label
            key={item.value}
            className={`flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2 transition-colors duration-[120ms] ${on ? "border-accent/60 bg-surface-2/50" : "border-border hover:border-muted/50"}`}
          >
            <input type="radio" name={name} checked={on} onChange={() => onChange(item.value)} className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--accent)]" />
            <span className="min-w-0">
              <span className="block text-[14px] font-medium leading-5">{item.title}</span>
              {item.hint ? <span className="block text-[12px] leading-4 text-muted">{item.hint}</span> : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** Label and value side by side: a card read as facts. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 border-t border-border/60 px-4 py-2 first:border-t-0">
      <dt className="text-[13px] leading-5 text-muted">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-[14px] leading-5">{children}</dd>
    </div>
  );
}

/** A short list of what an action does: «Исчезнет» and «Останется» stand side by side. */
export function Outcome({ title, tone, children }: { title: string; tone?: "danger"; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-border bg-surface/40 px-3 py-2">
      <p className={`text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] ${tone === "danger" ? "text-danger" : "text-muted"}`}>{title}</p>
      <ul className="no-bar mt-1.5 max-h-[220px] space-y-1 overflow-y-auto text-[13px] leading-[18px] text-text">{children}</ul>
    </div>
  );
}

export function OutcomeLine({ children, count }: { children: ReactNode; count?: number | string }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="min-w-0">{children}</span>
      {count !== undefined ? <span className="nums shrink-0 text-muted">{count}</span> : null}
    </li>
  );
}

/** A panel of the card while its data lands. */
export function PanelBones() {
  return (
    <SkeletonGroup grow>
      <Bone h={36} w={320} className="rounded-[11px]" />
      <Bone h={320} className="mt-4 rounded-[12px]" />
    </SkeletonGroup>
  );
}

/** A value taken once, when a dialog mounts: the id of one press, the same for each repeat of it. */
export function useOnce<T>(make: () => T): T {
  return useState(make)[0];
}
