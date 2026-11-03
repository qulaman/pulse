"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { orderFor, rememberSend } from "@/lib/errands/habits";
import { askSecretary } from "@/lib/errands/pending";
import { errandKeys, useSecretaryActions } from "@/lib/errands/queries";
import { sceneOfAction } from "@/lib/errands/scene";

/**
 * The director's usual requests to the secretary as one click each (D-154) — «Кофе» is nearly
 * half of them. The phone holds a button for two seconds (D-101); here a click goes and the toast
 * holds «Отменить» for five seconds (D-106), the same `askSecretary`. The alarm («Охрана») is not
 * among them: it is never one stray click away. Anything else — a line in the order bar.
 */
export function QuickErrands({ limit = 4 }: { limit?: number }) {
  const queryClient = useQueryClient();
  const actions = useSecretaryActions();
  const shown = useMemo(() => {
    const all = actions.data ?? [];
    const alarm = (action: (typeof all)[number]) => sceneOfAction(action) === "security";
    return orderFor(all, alarm).filter((action) => !alarm(action)).slice(0, limit);
  }, [actions.data, limit]);
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="desk-quick-errands">
      {shown.map((action) => (
        <button
          key={action.code}
          type="button"
          onClick={() => {
            rememberSend(action.code, null);
            askSecretary(action, null, () => void queryClient.invalidateQueries({ queryKey: errandKeys.root }));
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface-2/70 px-3 text-[13px] font-semibold leading-4 transition-colors duration-[120ms] hover:border-accent/50 hover:text-text"
        >
          {action.icon ? <span aria-hidden>{action.icon}</span> : null}
          {action.label}
        </button>
      ))}
    </div>
  );
}
