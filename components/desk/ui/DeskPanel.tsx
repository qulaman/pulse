"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Tooltip } from "@/components/desk/ui/Tooltip";
import { clampPanel, PANEL_DEFAULT, PANEL_MAX, PANEL_MIN } from "@/lib/desk/frame";

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

/** The left edge of the panel: drag (or ←/→ when focused) to widen it; a double click — back to the default. */
function PanelEdge({ width, onResize }: { width: number; onResize: (width: number, phase: "move" | "end") => void }) {
  const drag = useRef<{ x: number; width: number; last: number } | null>(null);
  const [active, setActive] = useState(false);
  const step = (delta: number) => onResize(clampPanel(width + delta), "end");
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина панели"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuenow={width}
      tabIndex={0}
      title="Потяните, чтобы изменить ширину"
      data-testid="desk-panel-edge"
      data-active={active ? "" : undefined}
      className="desk-panel-edge absolute inset-y-0 -left-[3px] z-20 w-[7px] cursor-col-resize outline-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width, last: width };
        setActive(true);
        document.documentElement.setAttribute("data-desk-resizing", "");
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start) return;
        // the panel is on the right: the edge moving left makes it wider
        const next = clampPanel(start.width + (start.x - event.clientX));
        if (next === start.last) return;
        start.last = next;
        onResize(next, "move");
      }}
      onPointerUp={(event) => {
        const start = drag.current;
        if (!start) return;
        drag.current = null;
        setActive(false);
        document.documentElement.removeAttribute("data-desk-resizing");
        event.currentTarget.releasePointerCapture(event.pointerId);
        onResize(start.last, "end");
      }}
      onPointerCancel={() => {
        drag.current = null;
        setActive(false);
        document.documentElement.removeAttribute("data-desk-resizing");
      }}
      onDoubleClick={() => onResize(PANEL_DEFAULT, "end")}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") step(event.shiftKey ? 64 : 16);
        else if (event.key === "ArrowRight") step(event.shiftKey ? -64 : -16);
        else if (event.key === "Home") onResize(PANEL_MAX, "end");
        else if (event.key === "End") onResize(PANEL_MIN, "end");
        else if (event.key === "Enter") onResize(PANEL_DEFAULT, "end");
        else return;
        event.preventDefault();
      }}
    >
      <span aria-hidden className="desk-panel-edge-line pointer-events-none absolute inset-y-0 left-[3px] w-px" />
    </div>
  );
}

/**
 * The head of what the panel shows (D-154 wave 3): the title and the words under it stay at the
 * top of the panel while its body scrolls; room is left for the panel's ×.
 */
export function PanelHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div data-testid="desk-panel-head" className={`sticky -top-4 z-[5] -mx-5 -mt-4 mb-1 border-b border-border/70 bg-surface px-5 pb-3 pr-14 pt-4 ${className}`}>
      {children}
    </div>
  );
}

/**
 * The right-hand panel (master–detail, D-153 §3): a column of the grid, not an overlay; its own
 * scroll, × and Esc close it. The content comes either from `open(node)` or through `InPanel`.
 * `onResize` — the shell lets its left edge be dragged (D-154 wave 3): «move» while the mouse
 * drags (the shell moves the column without a render), «end» once it lets go.
 */
export function DeskPanelColumn({
  node,
  onClose,
  setHost,
  width,
  onResize,
}: {
  node: ReactNode;
  onClose: () => void;
  setHost: (el: HTMLElement | null) => void;
  width?: number;
  onResize?: (width: number, phase: "move" | "end") => void;
}) {
  return (
    <aside
      aria-label="Панель"
      data-testid="desk-panel"
      // raised over the screen it details: a soft shadow to the left, the table stays a flat plane (D-154)
      className="relative z-10 flex min-h-0 flex-col border-l border-border bg-surface"
      style={{ boxShadow: "-12px 0 32px rgba(0, 0, 0, 0.35)" }}
    >
      {onResize ? <PanelEdge width={width ?? PANEL_DEFAULT} onResize={onResize} /> : null}
      <div className="absolute right-3 top-3 z-10">
        <Tooltip label="Закрыть" keys={["Esc"]} side="bottom">
          <button
            type="button"
            aria-label="Закрыть панель"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[18px] leading-none text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
          >
            ×
          </button>
        </Tooltip>
      </div>
      <div className="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
        {node}
        <div ref={setHost} className="contents" />
      </div>
    </aside>
  );
}
