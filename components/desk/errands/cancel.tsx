"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { dismissToast, toast } from "@/components/ui/Toast";
import { useErrandActions } from "@/lib/errands/mutations";
import { errandKeys, type Errand, type ErrandStatus } from "@/lib/errands/queries";

import { KeyCap } from "./Queue";
import { cancelWord } from "./words";

/**
 * «Отменить» on the desk (D-101 §3): the phone's one tap, with the window of the director's other
 * decisive taps instead of a question (D-139). `cancelled` has no way back on the server, so the
 * tap stays here for five seconds: the row leaves the live list at once, the toast holds «Вернуть»,
 * and only then the call goes. The timer is not a screen's: leaving the screen keeps the window,
 * leaving the page sends what waits.
 */

const UNDO_MS = 5_000;

/** Taps inside their window, by request: what sends each one now. */
const waiting = new Map<string, () => void>();

let listening = false;
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const flush = () => {
    for (const send of [...waiting.values()]) send();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

/** The request's state in every list the screens hold; a request has no cache of its own. */
function paint(client: QueryClient, id: string, status: ErrandStatus) {
  client.setQueriesData<Errand[]>({ queryKey: errandKeys.root }, (rows) => (Array.isArray(rows) ? rows.map((row) => (row.id === id ? { ...row, status } : row)) : rows));
}

export function useCancelErrand(): (errand: Errand) => void {
  const client = useQueryClient();
  const transition = useErrandActions();
  return (errand) => {
    if (waiting.has(errand.id)) return;
    listen();
    // a refetch on its way would bring the old state back over the tap
    void client.cancelQueries({ queryKey: errandKeys.root });
    paint(client, errand.id, "cancelled");

    let toastId = 0;
    const settle = () => {
      clearTimeout(timer);
      waiting.delete(errand.id);
      dismissToast(toastId);
    };
    const send = () => {
      settle();
      // already closed in those seconds — the mutation says so and refreshes the lists
      transition.mutate({ id: errand.id, to: "cancelled" });
    };
    const timer = setTimeout(send, UNDO_MS);
    waiting.set(errand.id, send);
    toastId = toast(`${errand.label} · отменено`, {
      // the toast outlives the window by a breath, so the button never vanishes under the mouse
      lifetimeMs: UNDO_MS + 400,
      // …but its bar runs out with the window itself
      windowMs: UNDO_MS,
      action: {
        label: "Вернуть",
        onClick: () => {
          settle();
          paint(client, errand.id, errand.status);
          void client.invalidateQueries({ queryKey: errandKeys.root });
        },
      },
    });
  };
}

/** The button of a live request in the panel; the row and the hero draw their own, smaller one. */
export function CancelErrandButton({ errand }: { errand: Errand }) {
  const cancel = useCancelErrand();
  return (
    <div>
      <Button size="sm" variant="secondary" onClick={() => cancel(errand)} data-testid="desk-errand-panel-cancel">
        {cancelWord(errand)}
        <KeyCap>X</KeyCap>
      </Button>
    </div>
  );
}
