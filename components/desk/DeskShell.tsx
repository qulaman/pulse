"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { DeskScope } from "@/components/desk/DeskScope";
import { DeskLinks } from "@/components/desk/ui/DeskLinks";
import { DeskPanelColumn, DeskPanelProvider, useDeskPanelState } from "@/components/desk/ui/DeskPanel";
import { Kbd } from "@/components/desk/ui/Kbd";
import { ShortcutsHelp, useShortcuts, type Shortcut } from "@/components/desk/ui/Shortcuts";
import { SideNav, useDeskBadges, type DeskBrand } from "@/components/desk/ui/SideNav";
import { TopBar } from "@/components/desk/ui/TopBar";
import { goPhoneView } from "@/lib/desk/device";
import { LIST_MIN, NAV_ICONS, NAV_WIDE, PANEL_DEFAULT, PANEL_MIN, readNavFolded, readPanelWidth, subscribeFrame, writeNavCookie, writeNavFolded, writePanelWidth } from "@/lib/desk/frame";
import { isCommandKey, focusCommandLine, isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { chordHref, DESK_NAV, DESK_PROFILE_KEY, deskAllows, deskHomeFor, type DeskRole } from "@/lib/desk/routes";
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
    root.dataset.journal = "";
    return () => {
      delete root.dataset.surface;
      delete root.dataset.journal;
    };
  }, []);
}

/** How long «G» waits for the section's letter; once its card of letters is up, longer — it is being read. */
const CHORD_MS = 1200;
const CHORD_READ_MS = 4000;
/** How long before the waiting «G» shows its letters — a hand that knows them never sees the card. */
const CHORD_HINT_MS = 350;

/**
 * The desk's keys (D-153 §3, D-154 wave 3), by the physical key so a Russian layout works:
 * Ctrl/Cmd+K or «/» — the order line; «G» and a letter — a section; «[» — the navigation folds
 * to icons and back; Esc — a sheet, a dialog or a popover closes itself, otherwise a field lets go
 * of the caret, otherwise the panel closes. The letter after «G» is taken in the capture phase:
 * it is the desk's, never a screen's own key (the calendar's «T», the inbox's «S»).
 */
function useDeskKeys(role: DeskRole, panel: { isOpen: boolean; close: () => void }, toggleNav: () => void, onChord: (waiting: boolean) => void) {
  const router = useRouter();
  const latest = useRef({ panel, toggleNav, onChord });
  useLayoutEffect(() => {
    latest.current = { panel, toggleNav, onChord };
  });
  useEffect(() => {
    let waiting = false;
    let hint: ReturnType<typeof setTimeout> | null = null;
    let expiry: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (hint) clearTimeout(hint);
      if (expiry) clearTimeout(expiry);
      hint = expiry = null;
    };
    const endChord = () => {
      waiting = false;
      clear();
      latest.current.onChord(false);
    };
    const startChord = () => {
      clear();
      waiting = true;
      expiry = setTimeout(endChord, CHORD_MS);
      hint = setTimeout(() => {
        latest.current.onChord(true);
        if (expiry) clearTimeout(expiry);
        expiry = setTimeout(endChord, CHORD_READ_MS);
      }, CHORD_HINT_MS);
    };

    // the second key of «G …», before any screen sees it
    const onCapture = (event: KeyboardEvent) => {
      if (!waiting) return;
      const href = isPlainKey(event) && !event.shiftKey ? chordHref(event.code, role) : null;
      endChord();
      if (href || event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (href) router.push(href);
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (role === "director" && isCommandKey(event)) {
        if (focusCommandLine()) event.preventDefault();
        return;
      }
      const typing = isTypingTarget(event.target);
      const modal = document.body.hasAttribute("data-sheet-open") || document.body.hasAttribute("data-dialog-open");
      if (!typing && !modal && isPlainKey(event) && !event.shiftKey && !event.repeat) {
        if (event.code === "KeyG") {
          startChord();
          return;
        }
        if (event.code === "BracketLeft") {
          event.preventDefault();
          latest.current.toggleNav();
          return;
        }
      }
      if (event.key !== "Escape" || modal) return;
      if (typing) {
        (event.target as HTMLElement).blur();
        return;
      }
      if (latest.current.panel.isOpen) latest.current.panel.close();
    };
    window.addEventListener("keydown", onCapture, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onCapture, true);
      window.removeEventListener("keydown", onKey);
      clear();
    };
  }, [role, router]);
}

/**
 * The browser tab says what waits (D-154): «(3) Pulse» — the director's decisions and visitors,
 * the secretary's requests nobody has taken. A desk behind the accounting program still calls;
 * the push of this computer (Профиль → Уведомления) rings for the rest.
 */
function DeskTitle({ role }: { role: DeskRole }) {
  const { counts } = useDeskBadges(role);
  const pathname = usePathname();
  const waiting = (role === "director" ? (counts.tasks ?? 0) + (counts.today ?? 0) : 0) + (counts.errands ?? 0);
  useEffect(() => {
    // after the route's own title is set (it says «Pulse» again on every screen)
    const timer = setTimeout(() => {
      document.title = waiting > 0 ? `(${waiting > 99 ? "99+" : waiting}) Pulse` : "Pulse";
    }, 0);
    return () => clearTimeout(timer);
  }, [waiting, pathname]);
  return null;
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

/** «G» is held in mind: the letters it now waits for, at the foot of the navigation. */
function ChordHint({ role, left }: { role: DeskRole; left: number }) {
  const items = [...DESK_NAV[role].map((item) => ({ key: item.key ?? "", label: item.label })), { key: DESK_PROFILE_KEY, label: "Профиль" }];
  return (
    <div
      role="status"
      aria-label="Перейти в раздел"
      className="desk-pop pointer-events-none fixed bottom-4 z-[60] w-[248px] rounded-[12px] border border-border bg-surface px-3 py-2.5"
      style={{ left, boxShadow: "var(--shadow-raised)" }}
      data-testid="desk-chord"
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">
        <Kbd>G</Kbd> перейти
      </p>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5 text-[13px] leading-5">
            <Kbd>{item.key}</Kbd>
            <span className="truncate text-text/90">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The keys of the frame, for the «?» help: the sections by «G», the fold. */
function frameShortcuts(role: DeskRole): Shortcut[] {
  return [
    ...DESK_NAV[role].map((item) => ({ keys: ["G", item.key ?? ""], label: item.label })),
    { keys: ["G", DESK_PROFILE_KEY], label: "Профиль" },
    { keys: ["["], label: "Свернуть или развернуть навигацию" },
  ];
}

/**
 * The desk of the director and the secretary (D-153): side navigation, the top bar with the order
 * line, the screen in `<main>` — the only part that scrolls — and the right-hand panel as a third
 * column of the grid while something is open in it. The navigation folds to icons and the panel
 * is as wide as it was left (D-154 wave 3): both remembered by the browser, the fold also by a
 * cookie the layout reads (`navFolded`), so the first frame is drawn right. A screen the role may
 * not have (the secretary's direct address to the director's tasks) leads to the role's desk home.
 */
export function DeskShell({ me, role, brand, navFolded = false, children }: { me: Me; role: DeskRole; brand: DeskBrand; navFolded?: boolean; children: ReactNode }) {
  const panel = useDeskPanelState();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = deskAllows(pathname, role);
  const narrow = useMediaQuery("(max-width: 959px)");
  const folded = useSyncExternalStore(subscribeFrame, () => readNavFolded() ?? navFolded, () => navFolded);
  const panelWidth = useSyncExternalStore(subscribeFrame, () => readPanelWidth() ?? PANEL_DEFAULT, () => PANEL_DEFAULT);
  const [chord, setChord] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const navWidth = folded ? NAV_ICONS : NAV_WIDE;
  const toggleNav = () => writeNavFolded(!folded);
  useDeskSurface();
  useDeskKeys(role, panel.api, toggleNav, setChord);
  useShortcuts("Переходы", frameShortcuts(role));

  useEffect(() => {
    if (!allowed) router.replace(deskHomeFor(role));
  }, [allowed, role, router]);

  // the fold on <html> for what lives outside the grid (the toasts), and in the cookie for the next load
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (folded) root.setAttribute("data-desk-nav", "icons");
    else root.removeAttribute("data-desk-nav");
    return () => root.removeAttribute("data-desk-nav");
  }, [folded]);
  useEffect(() => {
    if (folded !== navFolded) writeNavCookie(folded);
  }, [folded, navFolded]);
  // the toasts at the foot stand over the screen's column, clear of an open panel too
  const panelOpen = panel.api.isOpen;
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!panelOpen) return;
    root.setAttribute("data-desk-panel", "");
    root.style.setProperty("--desk-panel-w", `${panelWidth}px`);
    return () => {
      root.removeAttribute("data-desk-panel");
      root.style.removeProperty("--desk-panel-w");
    };
  }, [panelOpen, panelWidth]);

  // the list keeps its room: in a small window a panel dragged wide gives way, down to its minimum
  const columns = (width: number) =>
    panel.api.isOpen ? `${navWidth}px minmax(0,1fr) min(${width}px, max(${PANEL_MIN}px, calc(100vw - ${navWidth + LIST_MIN}px)))` : `${navWidth}px minmax(0,1fr)`;
  const resizePanel = (width: number, phase: "move" | "end") => {
    // while the mouse drags, the column moves without a render; the width is kept once it lets go
    if (phase === "move") {
      if (grid.current) grid.current.style.gridTemplateColumns = columns(width);
      return;
    }
    if (grid.current) grid.current.style.gridTemplateColumns = columns(width);
    writePanelWidth(width);
  };

  return (
    <DeskPanelProvider value={panel.api}>
      <DeskScope me={me} role={role} pointsEnabled={brand.pointsEnabled}>
        <div ref={grid} data-desk="" data-nav={folded ? "icons" : "wide"} className="grid h-dvh overflow-hidden bg-bg" style={{ gridTemplateColumns: columns(panelWidth) }}>
          <SideNav role={role} brand={brand} folded={folded} onToggle={toggleNav} />
          <div className="flex min-h-0 min-w-0 flex-col">
            <TopBar fullName={me.fullName} role={role} folded={folded} onToggleNav={toggleNav} />
            {/* `isolate`: the screen's light (DeskLight) sits under the content, inside the screen */}
            <main id="desk-main" className="relative isolate min-h-0 flex-1 overflow-y-auto">
              {allowed ? <DeskLinks className="contents">{children}</DeskLinks> : null}
            </main>
          </div>
          {panel.api.isOpen ? (
            <DeskLinks className="contents">
              <DeskPanelColumn node={panel.node} onClose={panel.close} setHost={panel.setHost} width={panelWidth} onResize={resizePanel} />
            </DeskLinks>
          ) : null}
        </div>
        {narrow ? <NarrowHint role={role} /> : null}
        {chord ? <ChordHint role={role} left={navWidth + 12} /> : null}
        <DeskTitle role={role} />
        {/* «?» — every key of the screen and of the desk (D-154 wave 3) */}
        <ShortcutsHelp />
      </DeskScope>
    </DeskPanelProvider>
  );
}
