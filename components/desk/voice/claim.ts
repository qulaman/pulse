"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Who has the desk's voice right now (D-177). By default it is the order line (D-164): «V» and the
 * microphone at the end of the line send the words to the parser. «Заметки» and «Доски» take it
 * for themselves while they are open — there everything said is a thought or a point word for
 * word (D-81), so the line's microphone steps aside and leaves «V» to the page: one microphone on
 * a screen. The quick thought (Alt+N) takes it while its window is open.
 *
 * The claim is a label — what the page's microphone says it does («Сказать мысль — слово в
 * слово»). The last claim wins; a page that leaves gives the voice back to whoever claimed before.
 */
let claims: { id: number; label: string }[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function current(): string | null {
  return claims.length > 0 ? claims[claims.length - 1]!.label : null;
}

/**
 * The page takes the desk's voice while it is mounted and `label` is not null. Returns «is the
 * voice mine right now» for the page's key handler: under an open quick thought the notes page
 * below it must leave «V» alone.
 */
export function useDeskVoiceClaim(label: string | null): () => boolean {
  const mine = useRef<number | null>(null);
  useEffect(() => {
    if (label === null) return;
    const id = nextId++;
    mine.current = id;
    claims = [...claims, { id, label }];
    emit();
    return () => {
      mine.current = null;
      claims = claims.filter((claim) => claim.id !== id);
      emit();
    };
  }, [label]);
  return useCallback(() => mine.current !== null && claims.length > 0 && claims[claims.length - 1]!.id === mine.current, []);
}

/** What has the voice: the claiming page's label, or null — the order line has it (D-164). */
export function useVoiceClaim(): string | null {
  return useSyncExternalStore(subscribe, current, () => null);
}

/** Outside React (key handlers): is the voice taken by a page right now. */
export function voiceClaimed(): boolean {
  return claims.length > 0;
}
