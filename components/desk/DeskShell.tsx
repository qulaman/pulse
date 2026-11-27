"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, ViewTransition, type ReactNode, type RefObject } from "react";

import { DeskAddress } from "@/components/desk/DeskAddress";
import { DeskScope } from "@/components/desk/DeskScope";
import { DeskTapSound } from "@/components/desk/DeskTapSound";
import { QuickNote } from "@/components/desk/QuickNote";
import { DeskLinks } from "@/components/desk/ui/DeskLinks";
import { DeskPanelColumn, DeskPanelProvider, useDeskPanelState } from "@/components/desk/ui/DeskPanel";
import { Kbd } from "@/components/desk/ui/Kbd";
import { ShortcutsHelp, useShortcuts, type Shortcut } from "@/components/desk/ui/Shortcuts";
import { SideNav, useDeskBadges, useSettled, type DeskBrand } from "@/components/desk/ui/SideNav";
import { TopBar } from "@/components/desk/ui/TopBar";
import { NotesReplay } from "@/components/notes/NotesReplay";
import { DeskAlarmGate } from "@/components/secretary/SecretaryAlarm";
import { keepAudioAwake, playChime, playRing, RING_EVERY_MS, unlockAudio, useAudioUnlocked, useDeskSound } from "@/lib/desk/chime";
import { goPhoneView } from "@/lib/desk/device";
import { directorSignal, newKeys, secretarySignal, tabTitle, type SignalDot } from "@/lib/desk/signals";
import { useErrands, useSecretaryActions } from "@/lib/errands/queries";
import { MeetingRing } from "@/lib/calendar/ring";
import { useReminderFlag, useReminderRinger } from "@/lib/notes/reminders";
import { useNow } from "@/lib/pulse/queries";
import { useVisits } from "@/lib/visits/queries";
import { useDeskLook, useDeskTheme } from "@/lib/desk/theme";
import { LIST_MIN, NAV_ICONS, NAV_WIDE, PANEL_DEFAULT, PANEL_MIN, readNavFolded, readPanelWidth, subscribeFrame, writeNavCookie, writeNavFolded, writePanelWidth } from "@/lib/desk/frame";
import { isCommandKey, focusCommandLine, isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { screenMove, type ScreenMove } from "@/lib/desk/motion";
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
 * The screen's move for the render that changes the address (D-184, lib/desk/motion.ts): the
 * class the screen's <ViewTransition> plays once — `played` (its onUpdate) puts `none` back as the
 * move starts, so a later change that stays on the screen (`?p=`, a filter, a part coming out of
 * Suspense) does not replay it. Kept as state, not a ref: a render React throws away takes its move
 * with it. The reset changes no DOM, so it starts nothing.
 */
function useScreenMove(pathname: string, role: DeskRole): [ScreenMove, () => void] {
  const [seen, setSeen] = useState<{ path: string; move: ScreenMove }>({ path: pathname, move: "none" });
  let now = seen;
  if (seen.path !== pathname) {
    now = { path: pathname, move: screenMove(seen.path, pathname, DESK_NAV[role].map((item) => item.href)) };
    setSeen(now);
  }
  const played = () => setSeen((was) => (was.move === "none" ? was : { path: was.path, move: "none" }));
  // and a frame after the commit in any case: a move that never played (skipped, cut by a quick hand,
  // a browser without View Transitions) must not wait for the next change on the screen to play there
  const { move } = now;
  useEffect(() => {
    if (move === "none") return;
    const frame = requestAnimationFrame(() => setSeen((was) => (was.move === "none" ? was : { path: was.path, move: "none" })));
    return () => cancelAnimationFrame(frame);
  }, [move]);
  return [move, played];
}

/**
 * The screen's box on the page, for app/desk/transitions.css (D-184): a part that changes inside the
 * screen (a switch, a step, the thing open) moves as a whole picture — of a scrolled list too — and
 * the strip above the screen cuts it, so it never lies over the top bar. The screen itself is not
 * named for these moves (a named part takes no click), so the cut sits on the transition's layer.
 * Every move of the box here changes its size (the navigation folds, the panel comes, the window).
 */
function useScreenEdge(main: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const node = main.current;
    if (!node) return;
    const style = document.documentElement.style;
    const mark = () => {
      const box = node.getBoundingClientRect();
      style.setProperty("--desk-main-left", `${box.left}px`);
      style.setProperty("--desk-main-top", `${box.top}px`);
      style.setProperty("--desk-main-right", `${box.right}px`);
    };
    mark();
    const watch = new ResizeObserver(mark);
    watch.observe(node);
    return () => {
      watch.disconnect();
      for (const name of ["--desk-main-left", "--desk-main-top", "--desk-main-right"]) style.removeProperty(name);
    };
  }, [main]);
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
const ICON_SRC = "/icons/favicon-64.png?v=2";
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
        // a ring of the icon's own dark ground keeps the dot apart from the mark
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
  // a reminder of his own that has just rung on this desk (D-177) says itself in the tab
  const reminder = useReminderFlag();

  const rows = errands.data ?? [];
  const lobby = visits.data ?? [];
  const signal = secretary
    ? secretarySignal({ meId, errands: rows, visits: lobby, now, catalogue: catalogue.data ?? [] })
    : directorSignal({ meId, count: (counts.tasks ?? 0) + (counts.rating ?? 0) + (counts.shop ?? 0) + (counts.errands ?? 0), errands: rows, visits: lobby, reminder });
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
    // a call comes with no touch before it: the audio stays awake on a touch screen too (D-204)
    const release = keepAudioAwake();
    unlockAudio();
    const wake = () => unlockAudio(true);
    window.addEventListener("pointerdown", wake, true);
    window.addEventListener("keydown", wake, true);
    return () => {
      release();
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

/**
 * The director's own reminders ring on time while the desk is open (D-177, `lib/notes/reminders.ts`):
 * the server's sweep comes once a day on this plan. «Открыть» in the toast is the desk's navigation.
 */
function DeskReminders({ meId }: { meId: string }) {
  const router = useRouter();
  useReminderRinger({ userId: meId }, (href) => router.push(href));
  return null;
}

/** The narrow window's note put away for this tab: it said its piece once. */
const NARROW_HINT_KEY = "desk-narrow-hint-off";

/**
 * A desktop window narrower than the desk is meant for: it still works, and says where it is easier
 * (В-11 в). A strip of its own under the top bar — it pushes the screen down, never lies over the
 * order line or a row (D-194) — and «×» puts it away until the tab closes.
 */
function NarrowHint({ role }: { role: DeskRole }) {
  const [off, setOff] = useState(() => {
    try {
      return sessionStorage.getItem(NARROW_HINT_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (off) return null;
  const close = () => {
    setOff(true);
    try {
      sessionStorage.setItem(NARROW_HINT_KEY, "1");
    } catch {
      // storage closed (a private window): the note stays away for this page only
    }
  };
  return (
    <div className="mx-2 mb-2 flex min-h-9 shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-[8px] border border-border bg-surface py-1.5 pl-4 pr-1.5 text-[13px] leading-4" data-testid="desk-narrow-hint">
      <span className="text-muted">Этот экран удобнее на телефоне</span>
      <span aria-hidden className="text-muted">·</span>
      <button type="button" className="font-semibold text-accent" onClick={() => goPhoneView(homeForRole(role))}>
        Открыть телефонную версию
      </button>
      <button type="button" aria-label="Скрыть подсказку" onClick={close} className="ml-1 flex h-6 w-6 items-center justify-center rounded-[6px] text-[16px] leading-none text-muted hover:bg-surface-2 hover:text-text">
        ×
      </button>
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
  const [move, played] = useScreenMove(pathname, role);
  useScreenEdge(main);
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
    // the desk's own address (D-184): a screen's `?…` changes in a transition, so it can move
    <DeskAddress>
      <DeskPanelProvider value={panel.api}>
        <DeskScope me={me} role={role} pointsEnabled={brand.pointsEnabled}>
          <div ref={grid} data-desk="" data-nav={folded ? "icons" : "wide"} className="grid h-dvh overflow-hidden bg-bg" style={{ gridTemplateColumns: columns(panelWidth) }}>
            <SideNav role={role} brand={brand} folded={folded} onToggle={toggleNav} />
            <div className="flex min-h-0 min-w-0 flex-col">
              <TopBar fullName={me.fullName} role={role} folded={folded} onToggleNav={toggleNav} />
              {narrow ? <NarrowHint role={role} /> : null}
              {/* the work area: the screen, and for a secretary the alarm over it or its strip above it (D-175) */}
              <div className="relative flex min-h-0 flex-1 flex-col" data-desk-work="">
                <DeskAlarmGate meId={me.userId} role={role} main={main} />
                {/* `isolate`: the screen's light (DeskLight) sits under the content, inside the screen.
                    The screen moves as one picture of its own box when the address leaves it (D-184):
                    the navigation and the top bar stay live, the scroll offset does not travel. A
                    switch inside it moves only its own part: a named part takes no click while it
                    moves, and the tabs and the toolbar must take the next one at once. */}
                <ViewTransition name="desk-screen" update={move} default="none" onUpdate={played}>
                  <main ref={main} id="desk-main" className="relative isolate min-h-0 flex-1 overflow-y-auto">
                    {allowed ? <DeskLinks className="contents">{children}</DeskLinks> : null}
                  </main>
                </ViewTransition>
              </div>
            </div>
            {/* the right-hand panel comes in from the right edge and leaves there (D-184): the boundary
                sits on the column itself, inside a wrapper that stays, so React sees the column come */}
            <DeskLinks className="contents">
              {panel.api.isOpen ? (
                <ViewTransition enter="desk-panel-in" exit="desk-panel-out" default="none">
                  <DeskPanelColumn node={panel.node} onClose={panel.close} attachHost={panel.attachHost} width={panelWidth} onResize={resizePanel} />
                </ViewTransition>
              ) : null}
            </DeskLinks>
          </div>
          {chord ? <ChordHint role={role} left={navWidth + 12} /> : null}
          <DeskSignals role={role} meId={me.userId} />
          {/* every button of the desk clicks — one listener, no button codes it (D-204) */}
          <DeskTapSound />
          {/* a meeting of this person rings a quarter of an hour before it (D-180) */}
          <MeetingRing meId={me.userId} />
          {role === "director" ? (
            <>
              {/* a thought kept on this computer without network lands once it is back, from any section (D-95, D-177) */}
              <NotesReplay />
              {/* Alt+N — a thought into «Заметки» from any section, verbatim (D-177) */}
              <QuickNote me={me} />
              <DeskReminders meId={me.userId} />
            </>
          ) : null}
          {/* «?» — every key of the screen and of the desk (D-154 wave 3) */}
          <ShortcutsHelp />
        </DeskScope>
      </DeskPanelProvider>
    </DeskAddress>
  );
}
