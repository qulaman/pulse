"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** One thing asking for the panel: a node given to `open`, or an `InPanel` rendering into it. */
type Claim = { key: string; onClose?: () => void; node?: ReactNode };

export type DeskPanelApi = {
  /** Shows `node` in the right-hand panel; `key` names what is open (a task's id, an errand's). */
  open: (node: ReactNode, options?: { key?: string; onClose?: () => void }) => void;
  /** Closes what the panel shows; its `onClose` runs (a screen clears its `?id` there). */
  close: () => void;
  isOpen: boolean;
  /** What is shown now — the row it belongs to stays selected. */
  openKey: string | null;
};

type PanelInternals = {
  host: HTMLElement | null;
  claim: (key: string, onClose: () => void) => void;
  release: (key: string) => void;
};

const PanelContext = createContext<(DeskPanelApi & PanelInternals) | null>(null);

const IMPERATIVE = "__open";

/**
 * The panel's state for the shell. Claims stack: the newest is shown, and when it goes the one
 * under it comes back — a task opened over an unsent order leaves the order where it was.
 */
export function useDeskPanelState() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const latest = useRef(claims);
  useLayoutEffect(() => {
    latest.current = claims;
  });

  const top = claims.at(-1) ?? null;

  const close = useCallback(() => {
    const shown = latest.current.at(-1);
    if (!shown) return;
    setClaims((current) => current.filter((claim) => claim !== shown));
    shown.onClose?.();
  }, []);
  const open = useCallback<DeskPanelApi["open"]>((node, options) => {
    const key = options?.key ?? IMPERATIVE;
    setClaims((current) => [...current.filter((claim) => claim.node === undefined || claim.key !== key), { key, node, onClose: options?.onClose }]);
  }, []);
  const claim = useCallback((key: string, onClose: () => void) => {
    setClaims((current) => [...current.filter((c) => c.key !== key), { key, onClose }]);
  }, []);
  const release = useCallback((key: string) => {
    setClaims((current) => current.filter((c) => c.node !== undefined || c.key !== key));
  }, []);

  const api = useMemo(
    () => ({
      open,
      close,
      isOpen: top !== null,
      openKey: top && top.key !== IMPERATIVE ? top.key : null,
      host,
      claim,
      release,
    }),
    [open, close, top, host, claim, release],
  );
  return { api, node: top?.node ?? null, setHost, close };
}

export function DeskPanelProvider({ value, children }: { value: DeskPanelApi & PanelInternals; children: ReactNode }) {
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function useDeskPanel(): DeskPanelApi {
  const api = useContext(PanelContext);
  if (!api) throw new Error("useDeskPanel outside the desk shell");
  return api;
}

/**
 * The declarative way into the panel: while this is mounted (and newest) its children render in
 * the panel — with the screen's own state and handlers, never a stale copy. `panelKey` names what
 * is open; × and Esc call `onClose`, which should unmount this (a screen drops its `?id` there).
 */
export function InPanel({ panelKey, onClose, children }: { panelKey: string; onClose: () => void; children: ReactNode }) {
  const api = useContext(PanelContext);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  const claim = api?.claim;
  const release = api?.release;
  useLayoutEffect(() => {
    if (!claim || !release) return;
    claim(panelKey, () => closeRef.current());
    return () => release(panelKey);
  }, [claim, release, panelKey]);
  if (!api?.host || api.openKey !== panelKey) return null;
  return createPortal(children, api.host);
}

/**
 * The right-hand panel (master–detail, D-153 §3): a column of the grid, not an overlay; its own
 * scroll, × and Esc close it. The content comes either from `open(node)` or through `InPanel`.
 */
export function DeskPanelColumn({ node, onClose, setHost }: { node: ReactNode; onClose: () => void; setHost: (el: HTMLElement | null) => void }) {
  return (
    <aside aria-label="Панель" data-testid="desk-panel" className="relative flex min-h-0 flex-col border-l border-border bg-surface">
      <button
        type="button"
        aria-label="Закрыть панель"
        title="Закрыть (Esc)"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-[10px] text-[18px] leading-none text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
      >
        ×
      </button>
      <div className="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
        {node}
        <div ref={setHost} className="contents" />
      </div>
    </aside>
  );
}
