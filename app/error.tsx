"use client";

import { useEffect } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";

/** Route-level error boundary: the assistant owns the failure, the director keeps the phone. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("route error:", error.message, error.digest);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      <Mascot state="thinking" size={88} />
      <h1 className="mt-5 text-[24px] font-bold leading-[30px]">Что-то пошло не так</h1>
      <p className="mt-2 text-[16px] leading-[22px] text-muted">
        Данные целы. Попробую открыть экран заново
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>Повторить</Button>
        <Button variant="secondary" onClick={() => (window.location.href = "/")}>
          На главную
        </Button>
      </div>
      {error.digest ? <p className="nums mt-6 text-[11px] text-muted">код {error.digest}</p> : null}
    </main>
  );
}
