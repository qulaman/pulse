"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";

import { DeskScope } from "@/components/desk/DeskScope";
import { DeskLinks } from "@/components/desk/ui/DeskLinks";
import { DeskPanelColumn, DeskPanelProvider, useDeskPanelState } from "@/components/desk/ui/DeskPanel";
import { Kbd } from "@/components/desk/ui/Kbd";
import { ShortcutsHelp, useShortcuts, type Shortcut } from "@/components/desk/ui/Shortcuts";
import { SideNav, useDeskBadges, useSettled, type DeskBrand } from "@/components/desk/ui/SideNav";
import { TopBar } from "@/components/desk/ui/TopBar";
import { DeskAlarmGate } from "@/components/secretary/SecretaryAlarm";
import { playChime, playRing, RING_EVERY_MS, unlockAudio, useAudioUnlocked, useDeskSound } from "@/lib/desk/chime";
import { goPhoneView } from "@/lib/desk/device";
import { directorSignal, newKeys, secretarySignal, tabTitle, type SignalDot } from "@/lib/desk/signals";
import { useErrands, useSecretaryActions } from "@/lib/errands/queries";
import { useNow } from "@/lib/pulse/queries";
import { useVisits } from "@/lib/visits/queries";
import { useDeskLook, useDeskTheme } from "@/lib/desk/theme";
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
  const theme = useDeskTheme();
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.deskTheme = theme;
    return () => {
      delete root.dataset.deskTheme;
    };
  }, [theme]);
  // «Графит» (D-171) over the journal's rules: graphite.css answers to this attribute alone
  const look = useDeskLook();
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (look === "graphite") root.dataset.graphite = "";
    else delete root.dataset.graphite;
    return () => {
      delete root.dataset.graphite;
    };
  }, [look]);
}

/**
 * The move between sections (D-171): the new screen rises a few pixels and comes up out of
 * nothing — on the compositor, never holding a click (the screen is there and live from its first
 * frame). «Журнал» and «уменьшить движение» change the screen in one frame, as before.
 */
function useScreenArrival(main: RefObject<HTMLElement | null>, pathname: string) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const screen = main.current?.firstElementChild;
    if (!(screen instanceof HTMLElement)) return;
    if (!document.documentElement.hasAttribute("data-graphite")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    screen.animate(
      [
        { opacity: 0, transform: "translateY(10px) scale(0.995)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [main, pathname]);
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

/** The icon the tab wears (app/layout.tsx metadata): drawn again with a dot while something waits. */
const ICON_SRC = "/icons/icon-192.png";
const DOT_INK: Record<Exclude<SignalDot, "none">, string> = { wait: "#f5b931", alarm: "#ff453a" };
const dotted = new Map<SignalDot, Promise<string | null>>();

/** The app's icon with a dot in its corner, as a data URL: amber — something waits, red — «Охрана». */
function dottedIcon(dot: Exclude<SignalDot, "none">): Promise<string | null> {
  const cached = dotted.get(dot);
  if (cached) return cached;
  const made = new Promise<string | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(image, 0, 0, 64, 64);
        // a ring of the icon's own dark ground keeps the dot apart from the pulse line
        ctx.fillStyle = "#0b0f14";
        ctx.beginPath();
        ctx.arc(49, 15, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = DOT_INK[dot];
        ctx.beginPath();
        ctx.arc(49, 15, 11, 0, Math.PI * 2);
        ctx.fill();
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = ICON_SRC;
  });
  dotted.set(dot, made);
  return made;
}

/**
 * Every icon link of the page shows `href`, or its own again (null). The links are the layout's
 * metadata: their own address is kept on them while the dot is up, and they are never removed —
 * React owns the nodes.
 */
function showIcon(href: string | null): void {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')) {
    if (href) {
      if (link.dataset.deskHref === undefined) link.dataset.deskHref = link.getAttribute("href") ?? "";
      if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    } else if (link.dataset.deskHref !== undefined) {
      link.setAttribute("href", link.dataset.deskHref);
      delete link.dataset.deskHref;
    }
  }
}

/**
 * What reaches the person outside the tab (D-154, D-175). The tab's title says what waits in
 * words — the secretary's «(1) Кофе — Pulse», «Охрана!» while it calls, for a minute the
 * director's answer to her («Директор: пусть заходит»); the director's tab keeps its number of
 * decisions, visitors and open requests. A dot on the tab's icon while something waits. With the
 * sound on (Профиль; on for the secretary, off for the director until chosen): a soft chime once
 * for each new request — for the director, a visitor, a message or a question — and the ring of
 * «Охрана» every few seconds until somebody takes it. The browser lets a page sound only after a
 * click or a key: the first one on the desk wakes the audio. The push of this computer (Профиль →
 * Уведомления) rings for a closed tab.
 */
function DeskSignals({ role, meId }: { role: DeskRole; meId: string }) {
  const { counts } = useDeskBadges(role);
  const pathname = usePathname();
  const settled = useSettled();
  const secretary = role === "secretary";
  const errands = useErrands(settled);
  const visits = useVisits(settled);
  const catalogue = useSecretaryActions(settled && secretary);
  // the director's answer leaves the secretary's tab a minute after it came
  const now = useNow(secretary ? 10_000 : 60_000);
  const sound = useDeskSound(role);
  const unlocked = useAudioUnlocked();

  const rows = errands.data ?? [];
  const lobby = visits.data ?? [];
  const signal = secretary
    ? secretarySignal({ meId, errands: rows, visits: lobby, now, catalogue: catalogue.data ?? [] })
    : directorSignal({ meId, count: (counts.tasks ?? 0) + (counts.today ?? 0) + (counts.errands ?? 0), errands: rows, visits: lobby });
  const title = tabTitle(signal);

  // what the head should say; the route's metadata says «Pulse» again on every screen, and a
  // refresh of the server's tree (a navigation, a reload of the layout) draws the head anew
  const head = useRef<{ title: string; icon: string | null }>({ title, icon: null });
  useEffect(() => {
    head.current.title = title;
    // after the route's own title is set
    const timer = setTimeout(() => {
      if (document.title !== head.current.title) document.title = head.current.title;
    }, 0);
    return () => clearTimeout(timer);
  }, [title, pathname]);

  const dot = signal.dot;
  useEffect(() => {
    let gone = false;
    if (dot === "none") {
      head.current.icon = null;
      showIcon(null);
    } else
      void dottedIcon(dot).then((href) => {
        if (gone || !href) return;
        head.current.icon = href;
        showIcon(href);
      });
    return () => {
      gone = true;
    };
  }, [dot, pathname]);

  // the head redrawn under the desk: the words and the dot put back at once
  useEffect(() => {
    const keep = () => {
      if (document.title !== head.current.title) document.title = head.current.title;
      if (head.current.icon) showIcon(head.current.icon);
    };
    const watch = new MutationObserver(keep);
    watch.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      watch.disconnect();
      // the desk gone (a phone screen, the sign-in): the icon is the app's own again
      showIcon(null);
    };
  }, []);

  // the first click or key wakes the audio — only when this computer is to sound at all
  useEffect(() => {
    if (!sound) return;
    unlockAudio();
    const wake = () => unlockAudio(true);
    window.addEventListener("pointerdown", wake, true);
    window.addEventListener("keydown", wake, true);
    return () => {
      window.removeEventListener("pointerdown", wake, true);
      window.removeEventListener("keydown", wake, true);
    };
  }, [sound]);

  // a chime once per new request: what was there when the desk opened is not news
  const ready = errands.data !== undefined && visits.data !== undefined;
  const seen = useRef<Set<string> | null>(null);
  const chimeKeys = signal.chime.join(",");
  const ringing = signal.ringing;
  useEffect(() => {
    if (!ready) return;
    const keys = chimeKeys ? chimeKeys.split(",") : [];
    if (!seen.current) {
      seen.current = new Set(keys);
      return;
    }
    const fresh = newKeys(seen.current, keys);
    for (const key of fresh) seen.current.add(key);
    // the alarm's ring speaks for everything while it calls
    if (fresh.length > 0 && sound && !ringing) playChime();
  }, [chimeKeys, ready, ringing, sound]);

  // «Охрана» rings until it is taken — and starts the moment the first click lets it
  useEffect(() => {
    if (!ringing || !sound || !unlocked) return;
    playRing();
    const timer = setInterval(playRing, RING_EVERY_MS);
    return () => clearInterval(timer);
  }, [ringing, sound, unlocked]);

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
  const main = useRef<HTMLElement>(null);
  useScreenArrival(main, pathname);
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
            {/* the work area: the screen, and for a secretary the alarm over it or its strip above it (D-175) */}
            <div className="relative flex min-h-0 flex-1 flex-col" data-desk-work="">
              <DeskAlarmGate meId={me.userId} role={role} main={main} />
              {/* `isolate`: the screen's light (DeskLight) sits under the content, inside the screen */}
              <main ref={main} id="desk-main" className="relative isolate min-h-0 flex-1 overflow-y-auto">
                {allowed ? <DeskLinks className="contents">{children}</DeskLinks> : null}
              </main>
            </div>
          </div>
          {panel.api.isOpen ? (
            <DeskLinks className="contents">
              <DeskPanelColumn node={panel.node} onClose={panel.close} setHost={panel.setHost} width={panelWidth} onResize={resizePanel} />
            </DeskLinks>
          ) : null}
        </div>
        {narrow ? <NarrowHint role={role} /> : null}
        {chord ? <ChordHint role={role} left={navWidth + 12} /> : null}
        <DeskSignals role={role} meId={me.userId} />
        {/* «?» — every key of the screen and of the desk (D-154 wave 3) */}
        <ShortcutsHelp />
      </DeskScope>
    </DeskPanelProvider>
  );
}
