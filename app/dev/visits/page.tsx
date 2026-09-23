"use client";

import { useState } from "react";

import { ReceptionCards } from "@/components/visits/ReceptionCards";
import { VisitAsk } from "@/components/visits/VisitAsk";
import { VisitorButton } from "@/components/visits/VisitorButton";
import type { Visit } from "@/lib/visits/queries";

/**
 * /dev/visits — «К вам посетитель» on fixtures (D-96, dev only): the secretary's button and
 * cards, the director's answer card. Taps would call the real API — look, do not press.
 */
export default function VisitsSandbox() {
  const [base] = useState(() => Date.now());
  const ago = (m: number) => new Date(base - m * 60_000).toISOString();
  const visit = (patch: Partial<Visit> & Pick<Visit, "id">): Visit => ({
    company_id: "c",
    author_id: "s",
    author: { full_name: "Айгуль Нурланова" },
    note: null,
    status: "waiting",
    answered_by: null,
    answered_at: null,
    tv_version: 3,
    shown_at: null,
    closed_at: null,
    client_request_id: null,
    created_at: ago(2),
    updated_at: ago(2),
    ...patch,
  });
  const visits: Visit[] = [
    visit({ id: "v1", note: "Иванов, по поставкам бетона", shown_at: ago(2) }),
    visit({ id: "v2", note: "Курьер с документами", status: "wait", created_at: ago(9), answered_at: ago(5), shown_at: ago(9) }),
    visit({ id: "v3", note: "Сауле из банка", status: "invited", created_at: ago(14), answered_at: ago(1) }),
    visit({ id: "v4", status: "expired", created_at: ago(40) }),
    visit({ id: "v5", note: "Иванов, по поставкам бетона", created_at: ago(60 * 26), closed_at: ago(60 * 25) }),
  ];
  const now = new Date(base);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6">
      <section className="flex flex-col gap-3" data-testid="secretary">
        <p className="text-[13px] uppercase tracking-[0.1em] text-muted">Секретарь · Лента</p>
        <div className="flex justify-center">
          <VisitorButton visits={visits} />
        </div>
        <ReceptionCards visits={visits} now={now} />
      </section>
      <section className="flex flex-col gap-3" data-testid="director">
        <p className="text-[13px] uppercase tracking-[0.1em] text-muted">Директор · Пульс</p>
        <VisitAsk visits={visits} now={now} />
      </section>
    </main>
  );
}
