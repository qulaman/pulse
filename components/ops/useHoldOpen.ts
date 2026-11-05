import { useEffect } from "react";

/**
 * A click beside a desk dialog closes it, and here a stray one would lose a typed reason or a code
 * shown once. The backdrop is the dialog's only «Закрыть» outside the Tab order. Esc, «×» and
 * «Отмена» stay: they are meant.
 */
export function useHoldOpen(hold: boolean) {
  useEffect(() => {
    if (!hold) return;
    const stop = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches?.('button[aria-label="Закрыть"][tabindex="-1"]')) event.stopPropagation();
    };
    document.addEventListener("click", stop, true);
    return () => document.removeEventListener("click", stop, true);
  }, [hold]);
}
