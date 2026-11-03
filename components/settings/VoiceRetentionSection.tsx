"use client";

import { useDraft } from "@/components/settings/draft";
import { SectionActions } from "@/components/settings/sections";
import { Chip } from "@/components/ui/Chip";
import { Disclosure } from "@/components/ui/Disclosure";
import type { CompanySettings } from "@/lib/settings";

type Retention = CompanySettings["voice_retention"];

/** The defaults of lib/settings.ts — not imported: zod stays off this page (D-126). */
const DEFAULTS: Retention = { closed_days: 90, orphan_days: 30 };
const CLOSED_STEPS = [30, 90, 180, 365];
const ORPHAN_STEPS = [7, 30, 90];

/** A box with the lid on: what is kept, and for how long. */
const KeepIcon = () => (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="14" height="3.5" rx="1" />
    <path d="M4.5 7.5v7a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-7" />
    <line x1="8" y1="11" x2="12" y2="11" />
  </svg>
);

function days(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дня`;
  return `${n} дней`;
}

function Steps({ label, steps, value, onPick }: { label: string; steps: number[]; value: number; onPick: (n: number) => void }) {
  // a term set some other way (SQL, an older screen) shows as its own chip, never as none picked
  const all = [...new Set([...steps, value])].sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[14px] font-medium leading-[18px] text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {all.map((n) => {
          const on = n === value;
          return (
            <Chip key={n} tone={on ? "accent" : "neutral"} aria-pressed={on} onClick={() => onPick(n)}>
              {days(n)}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

/**
 * «Хранение записей» (D-155 §3, D-18): how long a voice recording stays after what it belongs to
 * is closed, and how long one nothing came of. The sweep removes the file; the words stay.
 */
export function VoiceRetentionSection() {
  const { draft, server, update, dirty, save, saving } = useDraft();
  // `??`: a phone's offline copy (D-127) may hold settings from before the section
  const retention = draft.voice_retention ?? DEFAULTS;
  const set = (patch: Partial<Retention>) => update({ voice_retention: { ...retention, ...patch } });
  return (
    <Disclosure
      icon={<KeepIcon />}
      title="Хранение записей"
      dirty={dirty.voice_retention}
      summary={`${days(retention.closed_days)} · без дела ${days(retention.orphan_days)}`}
      hint="Тексты и расшифровки остаются навсегда. Запись „в корпус“ из „Лаб“ не удаляется."
    >
      <div className="flex flex-col gap-4">
        <Steps label="После закрытия дела" steps={CLOSED_STEPS} value={retention.closed_days} onPick={(closed_days) => set({ closed_days })} />
        <Steps label="Запись без дела" steps={ORPHAN_STEPS} value={retention.orphan_days} onPick={(orphan_days) => set({ orphan_days })} />
      </div>
      {dirty.voice_retention ? (
        <SectionActions
          pending={saving("voice_retention")}
          onSave={() => save({ voice_retention: retention })}
          onReset={() => update({ voice_retention: server.voice_retention ?? DEFAULTS })}
        />
      ) : null}
    </Disclosure>
  );
}
