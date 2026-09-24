"use client";

import { useEffect, useRef, useState } from "react";

import { humanAqtobe } from "@/lib/ai/time";
import { testVerdict, type TestRow, type TestVerdict } from "@/lib/push/health";

const POLL_MS = 1_500;
const GIVE_UP_MS = 30_000;

/**
 * «Проверить уведомления» (D-114): one real push through the outbox, then its fate read back
 * until the phone shows it — «Пришло на телефон · 09:14», «Уведомления не включены», or
 * after half a minute an honest «не пришло за 30 секунд». `userId` rings somebody else's
 * phone (the director and the secretary, from a person's card).
 */
export function usePushTest(userId?: string) {
  const [verdict, setVerdict] = useState<TestVerdict | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const at = (iso: string) => humanAqtobe(new Date(iso), new Date()).replace(/^сегодня /, "");

  const run = async () => {
    if (busy) return;
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    setVerdict(testVerdict(null, at));
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_request_id: crypto.randomUUID(), ...(userId ? { user_id: userId } : {}) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { id } = (await res.json()) as { id: string };
      const started = Date.now();
      const poll = async () => {
        try {
          const r = await fetch(`/api/push/test?id=${id}`, { credentials: "include" });
          const row = r.ok ? ((await r.json()) as TestRow) : null;
          const next = testVerdict(row, at);
          if (next.done) {
            setVerdict(next);
            setBusy(false);
            return;
          }
          if (Date.now() - started > GIVE_UP_MS) {
            setVerdict({ done: true, tone: "warn", text: "Не пришло за 30 секунд — телефон выключен или без связи" });
            setBusy(false);
            return;
          }
          setVerdict(next);
        } catch {
          // a missed poll is not an answer: ask again
        }
        timer.current = setTimeout(poll, POLL_MS);
      };
      timer.current = setTimeout(poll, POLL_MS);
    } catch {
      setVerdict({ done: true, tone: "warn", text: "Не получилось отправить проверку" });
      setBusy(false);
    }
  };

  return { verdict, busy, run };
}
