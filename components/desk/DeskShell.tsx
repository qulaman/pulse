"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

import { DeskScope } from "@/components/desk/DeskScope";
import { DeskLinks } from "@/components/desk/ui/DeskLinks";
import { DeskPanelColumn, DeskPanelProvider, useDeskPanelState } from "@/components/desk/ui/DeskPanel";
import { SideNav, type DeskBrand } from "@/components/desk/ui/SideNav";
import { TopBar } from "@/components/desk/ui/TopBar";
import { goPhoneView } from "@/lib/desk/device";
import { isCommandKey, focusCommandLine, isTypingTarget } from "@/lib/desk/keys";
import { deskAllows, deskHomeFor, type DeskRole } from "@/lib/desk/routes";
import { homeForRole } from "@/lib/routes";
import type { Me } from "@/lib/tasks/queries";
import { useMediaQuery } from "@/lib/useMediaQuery";

/**
 * The page is the desk (D-153 §4): `data-surface="desk"` on <html> turns the phone's bottom
 * sheets into centred dialogs and lets what docked above the tab bar stand in the flow
 * (globals.css). Taken off when the desk goes, so a phone screen opened after it is the phone's.
 */
function useDeskSurface() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.surface = "desk";
    return () => {
      delete root.dataset.surface;
    };
  }, []);
}

/**
 * The desk's keys (D-153 §3), by the physical key so a Russian layout works: Ctrl/Cmd+K or «/» —
 * the order line; Esc — a sheet or a dialog closes itself, otherwise a field lets go of the
 * caret, otherwise the panel closes.
 */
function useDeskKeys(director: boolean, panel: { isOpen: boolean; close: () => void }) {
  const latest = useRef(panel);
  useLayoutEffect(() => {
    latest.current = panel;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (director && isCommandKey(event)) {
        if (focusCommandLine()) event.preventDefault();
        return;
      }
      if (event.key !== "Escape") return;
      const body = document.body;
      if (body.hasAttribute("data-sheet-open") || body.hasAttribute("data-dialog-open")) return;
      if (isTypingTarget(event.target)) {
        (event.target as HTMLElement).blur();
        return;
      }
      if (latest.current.isOpen) latest.current.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [director]);
}

/** A desktop window narrower than the desk is meant for: it still works, and says where it is easier (В-11 в). */
function NarrowHint({ role }: { role: DeskRole }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] leading-4" style={{ boxShadow: "var(--shadow-raised)" }}>
        <span className="text-muted">Этот экран удобнее на телефоне</span>
        <span className="text-muted">·</span>
        <button type="button" className="font-semibold text-accent" onClick={() => goPhoneView(homeForRole(role))}>
          Открыть телефонную версию
        </button>
      </div>
    </div>
  );
}

/**
 * The desk of the director and the secretary (D-153): side navigation, the top bar with the order
 * line, the screen in `<main>` — the only part that scrolls — and the right-hand panel as a third
 * column of the grid while something is open in it. A screen the role may not have (the
 * secretary's direct address to the director's tasks) leads to the role's desk home.
 */
export function DeskShell({ me, role, brand, children }: { me: Me; role: DeskRole; brand: DeskBrand; children: ReactNode }) {
  const panel = useDeskPanelState();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = deskAllows(pathname, role);
  const narrow = useMediaQuery("(max-width: 959px)");
  useDeskSurface();
  useDeskKeys(role === "director", panel.api);

  useEffect(() => {
    if (!allowed) router.replace(deskHomeFor(role));
  }, [allowed, role, router]);

  return (
    <DeskPanelProvider value={panel.api}>
      <DeskScope me={me} role={role} pointsEnabled={brand.pointsEnabled}>
        <div
          data-desk=""
          className="grid h-dvh overflow-hidden bg-bg"
          style={{ gridTemplateColumns: panel.api.isOpen ? "232px minmax(0,1fr) 440px" : "232px minmax(0,1fr)" }}
        >
          <SideNav role={role} brand={brand} />
          <div className="flex min-h-0 min-w-0 flex-col">
            <TopBar fullName={me.fullName} role={role} />
            <main id="desk-main" className="relative min-h-0 flex-1 overflow-y-auto">
              {allowed ? <DeskLinks className="contents">{children}</DeskLinks> : null}
            </main>
          </div>
          {panel.api.isOpen ? (
            <DeskLinks className="contents">
              <DeskPanelColumn node={panel.node} onClose={panel.close} setHost={panel.setHost} />
            </DeskLinks>
          ) : null}
        </div>
        {narrow ? <NarrowHint role={role} /> : null}
      </DeskScope>
    </DeskPanelProvider>
  );
}
