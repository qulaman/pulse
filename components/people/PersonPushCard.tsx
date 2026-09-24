"use client";

import { usePushTest } from "@/components/push/usePushTest";
import { Button } from "@/components/ui/Button";
import { usePushHealth } from "@/lib/push/health-query";

const STATE_COLOR = { ok: "var(--ok)", idle: "var(--text-muted)", off: "var(--danger)", broken: "var(--danger)" } as const;

/**
 * The person's push channel on their card (D-114): does it work, and «Прислать проверку» — a
 * real push to their phone and whether it showed. No switches: an employee's notifications are
 * the system's, the card only tells the truth about them.
 */
export function PersonPushCard({ userId }: { userId: string }) {
  const health = usePushHealth();
  const test = usePushTest(userId);
  const verdict = health.data?.get(userId);

  return (
    <section className="mt-6">
      <h2 className="eyebrow px-1">Уведомления</h2>
      <div className="card mt-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: verdict ? STATE_COLOR[verdict.state] : "var(--border)" }}
          />
          <p className="min-w-0 flex-1 text-[16px] leading-[22px]">{verdict?.text ?? "…"}</p>
        </div>
        {verdict && verdict.state !== "ok" ? (
          <p className="mt-1 text-[13px] leading-[18px] text-muted">
            Пока пуши не доходят, человек узнаёт о задачах, только открыв Pulse. Попросите его открыть Pulse на телефоне и нажать
            «Включить уведомления»; на iPhone — сначала «На экран „Домой“».
          </p>
        ) : null}
        <div className="mt-3">
          <Button block variant="ghost" disabled={test.busy} onClick={() => void test.run()}>
            {test.busy ? "Проверяю…" : "Прислать проверку"}
          </Button>
          {test.verdict ? (
            <p
              className="mt-2 text-center text-[13px] leading-4"
              style={{ color: test.verdict.tone === "ok" ? "var(--ok)" : test.verdict.tone === "warn" ? "var(--danger)" : "var(--text-muted)" }}
            >
              {test.verdict.text}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
