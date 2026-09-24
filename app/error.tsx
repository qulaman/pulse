"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { Mascot } from "@/components/brand/Mascot";
import { Button } from "@/components/ui/Button";
import { applyUpdate } from "@/lib/update/client";
import { useServerVersion, versionKey } from "@/lib/update/queries";
import { useHydrated } from "@/lib/useHydrated";
import { BUILD, looksLikeStaleBuild, versionStatus } from "@/lib/version";

/** Route-level error boundary: the assistant owns the failure, the director keeps the phone. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const server = useServerVersion();
  const hydrated = useHydrated();
  // a chunk or an action the server no longer has — or just a dead network: the server's
  // own answer tells which (D-115). A new build: «Повторить» would fail the same way, only
  // the update helps.
  const suspect = looksLikeStaleBuild(`${error.name}: ${error.message}`);
  const status = hydrated ? versionStatus(BUILD, server.data) : "unknown";
  const stale = suspect && (status === "outdated" || status === "required");
  useEffect(() => {
    console.error("route error:", error.message, error.digest);
    if (suspect) void queryClient.invalidateQueries({ queryKey: versionKey });
  }, [error, suspect, queryClient]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      <Mascot state="thinking" size={88} />
      <h1 className="mt-5 text-[24px] font-bold leading-[30px]">{stale ? "Вышла новая версия" : "Что-то пошло не так"}</h1>
      <p className="mt-2 text-[16px] leading-[22px] text-muted">
        {stale ? "Данные целы. Обновлю приложение — и экран откроется" : "Данные целы. Попробую открыть экран заново"}
      </p>
      <div className="mt-6 flex gap-2">
        {stale ? (
          <Button onClick={() => void applyUpdate()}>Обновить</Button>
        ) : (
          <Button onClick={reset}>Повторить</Button>
        )}
        <Button variant="secondary" onClick={() => router.push("/")}>
          На главную
        </Button>
      </div>
      {error.digest ? <p className="nums mt-6 text-[11px] text-muted">код {error.digest}</p> : null}
    </main>
  );
}
