"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

import { HapticSwitch } from "@/components/ui/HapticSwitch";
import { warmCalendarMonth } from "@/lib/calendar/queries";
import { monthOf } from "@/lib/datetime/calendar";
import { warmNotes } from "@/lib/notes/queries";
import { afterHydration } from "@/lib/offline/persist";
import type { TabBarRole } from "@/lib/routes";
import { inboxCounts, useDirectorInbox, useFreshTaskCount, useMe, warmMyTasks, warmSentTasks } from "@/lib/tasks/queries";
import { onKeyboard, readKeyboard, type Keyboard } from "@/lib/ui/keyboard";

import styles from "./TabBar.module.css";

type TabRole = TabBarRole;

type Tab = { href: string; label: string; icon: ReactNode };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS = {
  pulse: (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <polyline points="2,12 7,12 10,5 14,19 17,10 19,12 22,12" />
    </svg>
  ),
  feed: (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="11.5" x2="13" y2="11.5" />
    </svg>
  ),
  tasks: (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <polyline points="4,7 6,9 9.5,5.5" />
      <line x1="12" y1="7" x2="20" y2="7" />
      <polyline points="4,13.5 6,15.5 9.5,12" />
      <line x1="12" y1="13.5" x2="20" y2="13.5" />
      <line x1="12" y1="19" x2="20" y2="19" />
      <circle cx="6.5" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  calendar: (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <circle cx="8.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  profile: (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  ),
  rating: (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4.5M17 6h2.5a2.5 2.5 0 0 1-2.6 4.5" />
      <path d="M12 14v3M8.5 20h7M10 17h4" />
    </svg>
  ),
  settings: (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </svg>
  ),
  notes: (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M6 3.5h7.5L19 9v11.5H6z" />
      <polyline points="13.5,3.5 13.5,9 19,9" />
      <line x1="9" y1="13" x2="15.5" y2="13" />
      <line x1="9" y1="16.5" x2="13" y2="16.5" />
    </svg>
  ),
  screen: (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8.5 20h7M12 16.5V20" />
    </svg>
  ),
  lab: (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M9.5 3h5M10 3v6.2L4.8 18.3A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.7L14 9.2V3" />
      <line x1="7.5" y1="15" x2="16.5" y2="15" />
    </svg>
  ),
};

/**
 * The lab (D-63): the model bench and the unit costs — on the director's and the secretary's
 * bars; on the team's too while the company tests the product (D-150, `tabsOf`).
 */
const LAB_TAB: Tab = { href: "/lab", label: "Лаб", icon: ICONS.lab };

/** «Календарь» (D-78): one screen for every role, so both bars carry the same tab. */
const CALENDAR_TAB: Tab = { href: "/calendar", label: "Календарь", icon: ICONS.calendar };

const EMPLOYEE_TABS: Tab[] = [
  { href: "/feed", label: "Лента", icon: ICONS.feed },
  { href: "/tasks", label: "Дела", icon: ICONS.tasks },
  CALENDAR_TAB,
  { href: "/rating", label: "Рейтинг", icon: ICONS.rating },
  { href: "/profile", label: "Профиль", icon: ICONS.profile },
];

const TABS: Record<TabRole, Tab[]> = {
  // D-59: four tabs each — the announcements live inside Пульс and Лента, the team inside Настройки
  director: [
    { href: "/pulse", label: "Пульс", icon: ICONS.pulse },
    { href: "/sent", label: "Задачи", icon: ICONS.tasks },
    CALENDAR_TAB,
    { href: "/notes", label: "Заметки", icon: ICONS.notes },
    { href: "/screen", label: "Экран", icon: ICONS.screen },
    { href: "/settings", label: "Настройки", icon: ICONS.settings },
    { href: "/profile", label: "Профиль", icon: ICONS.profile },
    LAB_TAB,
  ],
  employee: EMPLOYEE_TABS,
  // D-104: the secretary runs the settings and the roster — the employee's bar plus «Настройки»
  secretary: [
    ...EMPLOYEE_TABS.slice(0, 4),
    { href: "/settings", label: "Настройки", icon: ICONS.settings },
    ...EMPLOYEE_TABS.slice(4),
    LAB_TAB,
  ],
};

/**
 * A screen without a tab of its own lights the tab it is entered from, so the bar always
 * says where one is (D-112): a task opens from «Задачи», «Команда» lives in «Настройки»,
 * the announcements in Пульс and Лента, the shop behind «Рейтинг» (D-59, docs/FRONTEND.md).
 */
const SECTIONS: Record<TabRole, Record<string, string>> = {
  // «Данные», «Рейтинг», «Заявки» open from the director's «Настройки» rows too (D-113: «Назад» leads there)
  director: {
    "/tasks": "/sent",
    "/people": "/settings",
    "/shop": "/settings",
    "/rating": "/settings",
    "/admin": "/settings",
    "/secretary": "/settings",
    "/ether": "/pulse",
    "/confirm": "/pulse",
  },
  employee: { "/ether": "/feed", "/shop": "/rating" },
  secretary: { "/ether": "/feed", "/shop": "/rating", "/people": "/settings", "/secretary": "/settings" },
};

/** The role's tabs; `lab` — the company is testing, so the team's bar carries «Лаб» too (D-150). */
function tabsOf(role: TabRole, lab: boolean): Tab[] {
  return lab && role === "employee" ? [...TABS.employee, LAB_TAB] : TABS[role];
}

/** The lit tab and whether the screen is that tab's own (`page`) or lives inside it. */
function activeTab(role: TabRole, pathname: string, lab: boolean): { index: number; own: boolean } {
  const tabs = tabsOf(role, lab);
  const within = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const own = tabs.findIndex((tab) => within(tab.href));
  if (own >= 0) return { index: own, own: true };
  const section = Object.entries(SECTIONS[role]).find(([base]) => within(base));
  return { index: section ? tabs.findIndex((tab) => tab.href === section[1]) : -1, own: false };
}

/**
 * Where «Назад» leads from this screen (D-113): `null` on a tab's own root — a tab needs no
 * way back; anywhere else — the tab the screen lives in (the one the bar lights), or the
 * first tab, the home screen, when it lives in none.
 */
export function backTarget(role: TabRole, pathname: string, lab = false): string | null {
  const tabs = tabsOf(role, lab);
  if (tabs.some((tab) => tab.href === pathname)) return null;
  const { index } = activeTab(role, pathname, lab);
  return tabs[index >= 0 ? index : 0].href;
}

/**
 * The count the bars last showed on a tab, and whose it is. A tab in another layout mounts a
 * new bar, which shows it while its own count is still on the way: the badge neither blinks
 * out nor pops back — it pops only when the count really changes. Kept only once a count is
 * known, after the screen hydrated: nothing is here for the first render on a fresh start,
 * and that render still matches the server's HTML.
 */
const seenBadges = new Map<string, number>();
let seenFor: string | undefined;

type Badge = { count: number; pop: boolean };

/**
 * What each role should not miss, as a count on its tab: the employee's tasks not yet
 * accepted on «Дела», everything waiting for the director on «Пульс». Live through the
 * same queries the screens use, so the number never disagrees with the list behind it.
 */
function useTabBadges(role: TabRole): Record<string, Badge> {
  const me = useMe();
  // the counts are asked for once the screen under the bar has hydrated: asked at once, the board
  // landed before a streamed screen hydrated, and that screen (Пульс, a task's screen through its
  // placeholderData) drew data the server never had — React threw the page away (D-143)
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let gone = false;
    void afterHydration().then(() => {
      if (!gone) setSettled(true);
    });
    return () => {
      gone = true;
    };
  }, []);
  const userId = me.data?.userId;
  const fresh = useFreshTaskCount(role !== "director" && settled ? userId : undefined);
  const inbox = useDirectorInbox(me.data, role === "director" && settled);
  const href = role === "director" ? "/pulse" : "/tasks";
  // undefined — not known yet: not asked (still hydrating), or the answer is on its way
  const count = role === "director" ? inbox.data && inboxCounts(inbox.data).total : fresh.data;
  const seen = userId !== undefined && seenFor === userId ? seenBadges.get(href) : undefined;
  useEffect(() => {
    if (userId === undefined || count === undefined) return;
    if (seenFor !== userId) seenBadges.clear();
    seenFor = userId;
    seenBadges.set(href, count);
  });
  const shown = count ?? seen ?? 0;
  const pop = count !== undefined && seen !== undefined && count !== seen;
  return shown > 0 ? { [href]: { count: shown, pop } } : {};
}

/** Scroll travel (px) that folds the bar, and back up that unfolds it; near the top it is always open. */
const FOLD_AFTER = 28;
const UNFOLD_AFTER = 14;
const TOP_ZONE = 24;

/**
 * What docks above the bar follows it (`.above-tabbar` in globals.css): an attribute on
 * <html> says whether the bar stepped away for the keyboard or folded. An attribute, not a
 * custom property — changing one of those on <html> restyles the whole page.
 */
function syncDocked(nav: HTMLElement) {
  const root = document.documentElement;
  const state = nav.hasAttribute("data-away") ? "away" : nav.hasAttribute("data-folded") ? "folded" : null;
  if (state) root.dataset.tabbar = state;
  else delete root.dataset.tabbar;
}

/**
 * Scrolling down folds the bar into its slim form, scrolling up — or back at the top —
 * unfolds it (D-112). Every icon stays a live target in both forms: the fold hides the
 * word, never a destination, so it adds no tap. A new screen starts unfolded. Driven by
 * scroll, so it writes the attribute itself: no React render on the way.
 */
function useFold(nav: RefObject<HTMLElement | null>, pathname: string) {
  useEffect(() => {
    const node = nav.current;
    if (!node) return;
    const set = (on: boolean) => {
      if (node.hasAttribute("data-folded") === on) return;
      node.toggleAttribute("data-folded", on);
      syncDocked(node);
    };
    set(false);
    const clampedY = () => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      // iOS rubber-banding reports past both ends; the bounce is not the reader's intent
      return Math.min(Math.max(window.scrollY, 0), max);
    };
    let last = clampedY();
    let travel = 0;
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = clampedY();
      const dy = y - last;
      last = y;
      if (y < TOP_ZONE) {
        travel = 0;
        set(false);
        return;
      }
      if (dy === 0) return;
      travel = Math.sign(dy) === Math.sign(travel) ? travel + dy : dy;
      if (travel > FOLD_AFTER) set(true);
      else if (travel < -UNFOLD_AFTER) set(false);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [nav, pathname]);
}

/**
 * The on-screen keyboard is up. The capsule steps away and what docks above it lands on the
 * keyboard instead of floating a bar's height over it (D-112) — the keyboard leaves little
 * enough room as it is. Written in the viewport's own event, in the same frame as the docked
 * bar's own offset (lib/ui/keyboard.ts): no frame of a bar's height hanging over the keyboard,
 * and no React render on the way.
 */
function useKeyboardAway(nav: RefObject<HTMLElement | null>, scrim: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const node = nav.current;
    if (!node) return;
    const set = ({ up }: Keyboard) => {
      if (node.hasAttribute("data-away") === up) return;
      node.toggleAttribute("data-away", up);
      scrim.current?.toggleAttribute("data-away", up);
      syncDocked(node);
    };
    set(readKeyboard());
    syncDocked(node);
    return onKeyboard(set);
  }, [nav, scrim]);
}

/**
 * Where the last bar's thumb was seen as it went, in columns — between two when it went
 * mid-slide. A tab in another layout mounts a new bar, and its thumb slides on from here
 * instead of appearing in place.
 */
let thumbLeftAt: number | null = null;

/**
 * The thumb's spring (stiffness 520, damping 38, mass 0.9) written out: the slide is the
 * `linear()` curve of `.thumb` in the CSS, the stretch is its speed sampled below — per
 * column of travel, columns per second at [ms]. Both play on the compositor: the next
 * screen rendering on the main thread no longer stalls the thumb mid-way (D-136).
 */
const THUMB_MS = 320;
const THUMB_SPEED: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [15, 6.29], [30, 9.03], [43, 9.62], [60, 9.01], [90, 6.46], [130, 3.22], [170, 1.29], [210, 0.4], [260, 0.03], [320, 0],
];

/** Stretched along the travel by its speed, round again when it lands: a drop of light pulled across the glass. */
export function stretchKeyframes(columns: number): Keyframe[] {
  return THUMB_SPEED.map(([ms, speed]) => ({
    transform: `scaleX(${(1 + Math.min(speed * columns * 0.03, 0.34)).toFixed(3)})`,
    offset: ms / THUMB_MS,
  }));
}

/**
 * The column the thumb is seen on this very moment — between two mid-slide; without a box to
 * measure, the column it is headed for.
 */
function columnOf(thumb: HTMLElement): number {
  const style = getComputedStyle(thumb);
  const width = parseFloat(style.width);
  // `translateX(calc(var(--i) * 100%))`: the shift over the thumb's own width
  if (width > 0 && style.transform !== "none") return new DOMMatrixReadOnly(style.transform).m41 / width;
  return Number(thumb.style.getPropertyValue("--i")) || 0;
}

/**
 * Slides the thumb to `index` in columns (`--i`, a CSS transition) and stretches it on the
 * way. A new bar's thumb first stands where the last bar's was seen as it went, then slides
 * on with the stretch the travel left asks for. A tab in another layout swaps the bars in one
 * commit: the old bar's layout cleanup notes the place while its nodes are still on the page,
 * before the new bar's layout effects run.
 */
function useThumb(thumb: RefObject<HTMLSpanElement | null>, index: number) {
  const shown = useRef<number | null>(null);
  const stretching = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const el = thumb.current;
    if (!el) return;
    if (shown.current === null) {
      // the first bar since the app started stands on its own tab
      shown.current = thumbLeftAt ?? Math.max(index, 0);
      // put there at once: the layout effects before this one have already computed the thumb
      // on its markup column, and a slide from there would only be cancelled by the one below
      el.style.setProperty("transition", "none");
      el.style.setProperty("--i", String(shown.current));
      // the slide needs the starting column computed before the target replaces it
      void getComputedStyle(el).transform;
      el.style.removeProperty("transition");
    }
    if (index < 0 || shown.current === index) return;
    const travel = Math.abs(index - shown.current);
    shown.current = index;
    el.style.setProperty("--i", String(index));
    const pad = el.firstElementChild;
    if (!pad || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    stretching.current?.cancel();
    stretching.current = pad.animate(stretchKeyframes(travel), { duration: THUMB_MS, easing: "linear" });
  }, [thumb, index]);

  useLayoutEffect(() => {
    const el = thumb.current;
    return () => {
      if (el) thumbLeftAt = columnOf(el);
    };
  }, [thumb]);
}

/**
 * The tabs are prefetched in full (`prefetch` on their links) and such a copy lives 30
 * minutes (`staleTimes.static`, next.config): a tab opens without asking the server. A phone
 * back from a longer stay in the background asks for fresh copies at once, so its first tap
 * does not wait either (D-136).
 */
const WARM_MS = 25 * 60_000;
let warmedAt = 0;

function useWarmTabs(tabs: Tab[]) {
  const router = useRouter();
  useEffect(() => {
    const warm = () => {
      if (document.visibilityState !== "visible" || Date.now() - warmedAt < WARM_MS) return;
      warmedAt = Date.now();
      for (const tab of tabs) router.prefetch(tab.href);
    };
    warm();
    document.addEventListener("visibilitychange", warm);
    return () => document.removeEventListener("visibilitychange", warm);
  }, [router, tabs]);
}

/**
 * The lists behind the tabs, fetched once the screen in front has settled (D-136): the first
 * open of a tab after signing in or after an update (the phone's copy of the data belongs to
 * one build, D-127) paints the list at once instead of its skeleton. Not before the page has
 * hydrated — data a still-hydrating part reads would differ from the server's HTML (#418).
 * Data already fresh is left alone; nothing here listens live — a screen subscribes when it opens.
 */
const WARM_DATA_AFTER_MS = 1_500;
let dataWarmedFor: string | null = null;

function useWarmTabData(role: TabRole) {
  const queryClient = useQueryClient();
  const userId = useMe().data?.userId;
  useEffect(() => {
    if (!userId || dataWarmedFor === userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let gone = false;
    void afterHydration().then(() => {
      if (gone) return;
      timer = setTimeout(() => {
        dataWarmedFor = userId;
        if (role === "director") {
          void warmSentTasks(queryClient, userId);
          void warmNotes(queryClient, userId);
        } else {
          void warmMyTasks(queryClient, userId);
        }
        void warmCalendarMonth(queryClient, monthOf(null));
      }, WARM_DATA_AFTER_MS);
    });
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [queryClient, role, userId]);
}

/**
 * Bottom navigation (D-112): a floating glass capsule over the screen. A raised accent
 * thumb slides to the chosen tab the moment it is tapped (the route catches up), the
 * chosen icon rises and says its name; the others are icons with their names for
 * assistive tech — eight tabs never truncate to «Кале…». Scrolling down folds the capsule.
 * Everything that docks above the bar sits at `--tabbar-space` and wears `.above-tabbar`.
 */
export function TabBar({ role, lab = false }: { role: TabRole; lab?: boolean }) {
  const pathname = usePathname();
  const badges = useTabBadges(role);
  const nav = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  useFold(nav, pathname);
  useKeyboardAway(nav, scrim);
  const tabs = tabsOf(role, lab);

  // the thumb answers the tap, not the network: it leaves before the next screen arrives.
  // The tap is forgotten once the route moves — back from «Дела» to «Лента» in the same
  // layout must not find the thumb still on «Дела»
  const [tapped, setTapped] = useState<number | null>(null);
  const [tappedOn, setTappedOn] = useState(pathname);
  if (tappedOn !== pathname) {
    setTappedOn(pathname);
    setTapped(null);
  }
  const route = activeTab(role, pathname, lab);
  const index = tapped ?? route.index;
  // the column the markup draws the thumb on: the server's HTML is seen before any script
  // runs. From then on only useThumb moves it — React never writes `--i` again
  const [drawnAt] = useState(index);
  const thumbRef = useRef<HTMLSpanElement>(null);
  useThumb(thumbRef, index);
  useWarmTabs(tabs);
  useWarmTabData(role);

  useEffect(
    () => () => {
      delete document.documentElement.dataset.tabbar;
    },
    [],
  );

  return (
    <>
      {/* the capsule floats; this keeps its room at the end of the page so nothing ends under it */}
      <div aria-hidden className={styles.spacer} />
      {/* `data-away` on both is the keyboard's, set outside React (useKeyboardAway) */}
      <div ref={scrim} aria-hidden className={styles.scrim} />
      <nav
        ref={nav}
        aria-label="Основная навигация"
        className={styles.capsule}
        style={{ "--n": tabs.length } as CSSProperties}
      >
        <span
          ref={thumbRef}
          aria-hidden
          className={styles.thumb}
          data-off={index >= 0 ? undefined : ""}
          style={{ "--i": Math.max(drawnAt, 0) } as CSSProperties}
        >
          <span className={styles.stretch}>
            <span className={styles.lamp} />
            <span className={styles.pill} />
          </span>
        </span>
        <ul className={styles.row}>
          {tabs.map((tab, i) => {
            const active = i === index;
            const badge = badges[tab.href];
            const count = badge?.count ?? 0;
            return (
              <li key={tab.href} className="min-w-0">
                <Link
                  href={tab.href}
                  prefetch
                  aria-label={count > 0 ? `${tab.label}, ${count} требуют внимания` : tab.label}
                  aria-current={i === route.index ? (route.own ? "page" : "true") : undefined}
                  data-active={active ? "" : undefined}
                  className={styles.cell}
                  onClick={(event) => {
                    // a new browser tab or window leaves this screen where it is
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                    if (pathname === tab.href) {
                      // the tab of this very screen takes it back to the top, as on every phone
                      event.preventDefault();
                      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                      window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
                      return;
                    }
                    if (i !== index) setTapped(i);
                  }}
                >
                  <span className={styles.icon}>
                    {tab.icon}
                    {count > 0 ? (
                      <span key={count} className={`nums ${styles.badge} ${badge?.pop ? styles.badgePop : ""}`} aria-hidden>
                        {count > 99 ? "99+" : count}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.label} aria-hidden>
                    {tab.label}
                  </span>
                  {/* the iPhone's tick lies under the finger (D-147) */}
                  <HapticSwitch />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
