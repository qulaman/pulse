"use client";

import { verdict } from "@/lib/tasks/status-text";
import type { TvCounts, TvToday } from "@/lib/tv/queries";

/**
 * Правый верх: вердикт дня и три числа. Вердикт — тот же расчёт, что у директора в
 * телефоне (lib/tasks/status-text), но на стене он безличен: имён в нём нет и быть не
 * может — негатив адресован только адресату (D-45).
 */

const TONE: Record<string, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

function Number({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[6.4vh] font-bold leading-[7vh] tabular-nums">{value}</span>
      <span className="text-[1.8vh] leading-[2.2vh] text-muted">{label}</span>
    </div>
  );
}

export function TvVerdict({ counts, today }: { counts: TvCounts; today: TvToday }) {
  const line = verdict(counts);

  return (
    <section className="flex flex-col justify-between rounded-[1.8vh] border border-border bg-surface px-[2.4vh] py-[2.2vh]">
      <div>
        <p className="text-[1.8vh] uppercase leading-[2.2vh] tracking-[0.18em] text-muted">Сейчас</p>
        <p
          className="mt-[0.8vh] text-[3.6vh] font-semibold leading-[4.2vh]"
          style={{ color: TONE[line.tone] ?? "var(--text)" }}
        >
          {line.text}
        </p>
      </div>

      <div className="mt-[2vh] flex items-end justify-between">
        <Number value={today.sent} label="поручений за день" />
        <Number value={today.done} label="принято" />
        <Number value={today.in_work} label="в работе" />
      </div>
    </section>
  );
}
