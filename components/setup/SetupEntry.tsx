"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSetup } from "@/components/setup/useSetup";
import { markSeen, registerWorker } from "@/lib/push/client";
import { aqtobeDay, entryLine, progressLabel } from "@/lib/setup/steps";

/**
 * The home screens' one line about the phone (D-190): «Настроить телефон · 2 из 4 ›» and, under it,
 * what to do first — the way into «Подключение» in place of the separate push and install cards,
 * no taller than a task's row. «×» hides it until tomorrow. Only while the push itself is not
 * through (`entryLine`); nothing once it is. It also does what the push card did on opening the
 * app: registers the worker and closes the receipts («увидел», D-32).
 */
export function SetupEntry({ from = "feed" }: { from?: "feed" | "pulse" }) {
  const setup = useSetup();
  // the day is read once per mount: «×» hides the line until the next day's home screen
  const [today] = useState(() => aqtobeDay(new Date()));

  useEffect(() => {
    const timer = setTimeout(() => {
      void registerWorker();
      markSeen();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!setup) return null;
  const line = entryLine(setup.facts, setup.steps);
  if (!line || setup.marks.later === today) return null;

  return <SetupEntryLine count={progressLabel(setup.progress)} line={line} href={`/setup?from=${from}`} onLater={setup.actions.later} />;
}

/** The line itself — drawn by the sandbox too (/dev/setup?entry). */
export function SetupEntryLine({ count, line, href, onLater }: { count: string; line: string; href: string; onLater: () => void }) {
  return (
    <div className="card-in relative flex items-center gap-1 pl-4" data-testid="setup-entry">
      <span aria-hidden className="absolute left-0 top-[8px] h-2 w-2 rounded-full bg-accent" />
      <Link href={href} className="min-w-0 flex-1 py-0.5" data-testid="setup-entry-go">
        <span className="block text-[15px] leading-5">
          Настроить телефон · <span className="nums">{count}</span> <span className="text-accent">›</span>
        </span>
        <span className="block truncate text-[13px] leading-4 text-muted">{line}</span>
      </Link>
      <button
        type="button"
        aria-label="Скрыть до завтра"
        onClick={onLater}
        className="-my-1 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-[18px] leading-none text-muted"
      >
        ×
      </button>
    </div>
  );
}
