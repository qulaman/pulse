"use client";

import { X } from "lucide-react";
import { createContext, startTransition, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, ViewTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Tooltip } from "@/components/desk/ui/Tooltip";
import { clampPanel, PANEL_DEFAULT, PANEL_MAX, PANEL_MIN } from "@/lib/desk/frame";
import { PANEL_PICK } from "@/lib/desk/motion";

/** One thing asking for the panel: a node given to `open`, or an `InPanel` rendering into it (`id` — that `InPanel`'s own). */
type Claim = { id: string; key: string; onClose?: () => void; node?: ReactNode };

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
  /** Where an `InPanel` draws: one element for the shell's life, put into the column while it stands. */
  host: HTMLElement | null;
  /** The `InPanel` on top of the stack — the one drawn. */
  topId: string | null;
  claim: (id: string, key: string, onClose: () => void) => void;
  rename: (id: string, key: string) => void;
  release: (id: string) => void;
};

const PanelContext = createContext<(DeskPanelApi & PanelInternals) | null>(null);

const IMPERATIVE = "__open";

/**
 * The panel's state for the shell. Claims stack: the newest is shown, and when it goes the one
 * under it comes back — a task opened over an unsent order leaves the order where it was.
 *
 * The panel moves (D-184): it comes in from the right edge and leaves there, the thing in it
 * changes in place. So it opens and closes inside transitions, and what an `InPanel` draws is in
 * the column the moment the column stands: `host` is one element made once and put into the column
 * by its ref — not a node the column makes after it is drawn, which would fill it a commit late,
 * outside the move. The stack itself is kept at once (`stack`), its picture for React a transition
 * later when something comes: Esc right after a task was opened closes that task, not the one under
 * it, and a claim that comes after its `InPanel` has gone (a quick close) is not there to come.
 */
export function useDeskPanelState() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [host] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const element = document.createElement("div");
    element.className = "contents";
    return element;
  });
  const stack = useRef<Claim[]>([]);
  /** The stack as it is now, to React: inside a transition when the column may come or go with it. */
  const publish = useCallback((moving: boolean) => {
    const next = stack.current.slice();
    if (moving) startTransition(() => setClaims(next));
    else setClaims(next);
  }, []);

  const top = claims.at(-1) ?? null;

  // × and Esc: the panel and what it shows go in one transition — the column leaves with its content
  const close = useCallback(() => {
    const shown = stack.current.at(-1);
    if (!shown) return;
    stack.current = stack.current.filter((claim) => claim !== shown);
    const next = stack.current.slice();
    startTransition(() => {
      setClaims(next);
      shown.onClose?.();
    });
  }, []);
  const open = useCallback<DeskPanelApi["open"]>(
    (node, options) => {
      const key = options?.key ?? IMPERATIVE;
      stack.current = [...stack.current.filter((claim) => claim.node === undefined || claim.key !== key), { id: `${IMPERATIVE}:${key}`, key, node, onClose: options?.onClose }];
      publish(true);
    },
    [publish],
  );
  // an InPanel coming: on top, and the column comes in moving
  const claim = useCallback(
    (id: string, key: string, onClose: () => void) => {
      stack.current = [...stack.current.filter((c) => c.id !== id), { id, key, onClose }];
      publish(true);
    },
    [publish],
  );
  // the same InPanel showing another thing: on top again, as a new claim was — a result that lands
  // under a task opened meanwhile comes back over it
  const rename = useCallback(
    (id: string, key: string) => {
      const was = stack.current.find((c) => c.id === id);
      if (!was || was.key === key) return;
      stack.current = [...stack.current.filter((c) => c.id !== id), { ...was, key }];
      publish(false);
    },
    [publish],
  );
  // an InPanel gone with its screen: at once — a column left standing over the next screen would be empty
  const release = useCallback(
    (id: string) => {
      if (!stack.current.some((c) => c.id === id)) return;
      stack.current = stack.current.filter((c) => c.id !== id);
      publish(false);
    },
    [publish],
  );

  const api = useMemo(
    () => ({
      open,
      close,
      isOpen: top !== null,
      openKey: top && top.key !== IMPERATIVE ? top.key : null,
      host,
      topId: top && top.node === undefined ? top.id : null,
      claim,
      rename,
      release,
    }),
    [open, close, top, host, claim, rename, release],
  );
  /** The column's ref: the host goes into the column as it stands. */
  const attachHost = useCallback(
    (element: HTMLElement | null) => {
      if (element && host && host.parentNode !== element) element.appendChild(host);
    },
    [host],
  );
  return { api, node: top?.node ?? null, attachHost, close };
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
 * Another `panelKey` is the same place in the stack showing another thing: drawn in the same
 * commit, the old thing changing into the new one in place when the screen's write says
 * `desk-pick` (`PANEL_PICK` of lib/desk/motion.ts); the content under the boundary is keyed by
 * `panelKey`, so another thing starts with its own state.
 */
export function InPanel({ panelKey, onClose, children }: { panelKey: string; onClose: () => void; children: ReactNode }) {
  const api = useContext(PanelContext);
  const id = useId();
  const closeRef = useRef(onClose);
  const keyRef = useRef(panelKey);
  useLayoutEffect(() => {
    closeRef.current = onClose;
    keyRef.current = panelKey;
  });
  const claim = api?.claim;
  const rename = api?.rename;
  const release = api?.release;
  useLayoutEffect(() => {
    if (!claim || !release) return;
    claim(id, keyRef.current, () => closeRef.current());
    return () => release(id);
  }, [claim, release, id]);
  useLayoutEffect(() => {
    rename?.(id, panelKey);
  }, [rename, id, panelKey]);
  if (!api?.host || api.topId !== id) return null;
  return createPortal(
    <ViewTransition update={PANEL_PICK} default="none">
      <div key={panelKey} data-panel-item="">
        {children}
      </div>
    </ViewTransition>,
    api.host,
  );
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
  attachHost,
  width,
  onResize,
}: {
  node: ReactNode;
  onClose: () => void;
  attachHost: (el: HTMLElement | null) => void;
  width?: number;
  onResize?: (width: number, phase: "move" | "end") => void;
}) {
  return (
    <aside
      aria-label="Панель"
      data-testid="desk-panel"
      className="relative z-10 flex min-h-0 flex-col border-l border-border bg-surface"
    >
      {onResize ? <PanelEdge width={width ?? PANEL_DEFAULT} onResize={onResize} /> : null}
      {/* on the middle of the content's first line: 16 px from the top, as the content starts */}
      <div className="absolute right-3 top-4 z-10">
        <Tooltip label="Закрыть" keys={["Esc"]} side="left">
          <button
            type="button"
            aria-label="Закрыть панель"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition-colors duration-[140ms] hover:bg-surface-2 hover:text-text"
          >
            <X aria-hidden size={16} />
          </button>
        </Tooltip>
      </div>
      <div className="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
        {node}
        <div ref={attachHost} className="contents" />
      </div>
    </aside>
  );
}
