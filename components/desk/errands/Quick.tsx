"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { orderFor, rememberSend } from "@/lib/errands/habits";
import { askSecretary } from "@/lib/errands/pending";
import { errandKeys, useSecretaryActions } from "@/lib/errands/queries";
import { sceneOfAction } from "@/lib/errands/scene";

import { ActionGlyph } from "./look";

/**
 * The director's usual requests in one click each (D-154, D-158) — `QuickErrands` of the desk in the
 * language of «Сегодня» (D-169): every word wears its scene's icon. The same order of habits, the
 * same `askSecretary` (a click goes, the toast holds «Отменить» five seconds, D-106); the alarm is
 * never one stray click away and is not here.
 */
export function QuickAsk({ limit = 6 }: { limit?: number }) {
  const queryClient = useQueryClient();
  const actions = useSecretaryActions();
  const shown = useMemo(() => {
    const all = actions.data ?? [];
    const alarm = (action: (typeof all)[number]) => sceneOfAction(action) === "security";
    return orderFor(all, alarm).filter((action) => !alarm(action)).slice(0, limit);
  }, [actions.data, limit]);
  if (shown.length === 0) return null;
  return (
    <div className="errands-quick flex flex-wrap items-center" data-testid="desk-quick-errands">
      {shown.map((action, index) => (
        <button
          key={action.code}
          type="button"
          onClick={() => {
            rememberSend(action.code, null);
            askSecretary(action, null, () => void queryClient.invalidateQueries({ queryKey: errandKeys.root }));
          }}
          title="Отправлю через 5 с — успеете отменить"
          className="desk-focus inline-flex items-center gap-1.5 text-[14px] leading-5"
          style={{ animationDelay: `${index * 30}ms` }}
          data-code={action.code}
        >
          <ActionGlyph action={action} />
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}
