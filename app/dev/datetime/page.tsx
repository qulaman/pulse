"use client";

import { useState } from "react";

import { DateField } from "@/components/ui/datetime/DateField";
import { DateTimeField } from "@/components/ui/datetime/DateTimeField";
import { TimeField } from "@/components/ui/datetime/TimeField";
import { todayYmd } from "@/lib/datetime/calendar";

/** Sandbox for the calendar and the clock — no network, no auth, just the three fields. */
export default function DateTimeSandbox() {
  const [day, setDay] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>("08:00");
  const [deadline, setDeadline] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <h1 className="font-display text-[22px] font-semibold leading-7">Календарь и время</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Свои поля вместо системных: components/ui/datetime
      </p>

      <section className="mt-6">
        <h2 className="eyebrow">Дата</h2>
        <div className="mt-2">
          <DateField value={day} onChange={setDay} min={todayYmd()} />
        </div>
        <p className="nums mt-2 text-[13px] leading-4 text-muted">{day ?? "—"}</p>
      </section>

      <section className="mt-6">
        <h2 className="eyebrow">Время</h2>
        <div className="mt-2">
          <TimeField value={from} onChange={setFrom} />
        </div>
        <p className="nums mt-2 text-[13px] leading-4 text-muted">{from ?? "—"}</p>
      </section>

      <section className="mt-6">
        <h2 className="eyebrow">Срок</h2>
        <div className="mt-2">
          <DateTimeField value={deadline} onChange={setDeadline} />
        </div>
        <p className="nums mt-2 text-[13px] leading-4 text-muted">{deadline ?? "—"}</p>
      </section>
    </main>
  );
}
