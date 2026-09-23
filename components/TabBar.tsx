"use client";

import { motion, MotionConfig, useReducedMotion, useSpring, useTransform, useVelocity } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

import type { TabBarRole } from "@/lib/routes";
import { inboxCounts, useDirectorInbox, useMe, useMyTasks } from "@/lib/tasks/queries";
import { useVisualViewport } from "@/lib/ui/useVisualViewport";

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

/** The developer's lab (D-63): every role sees it for now, no role check by design. */
const LAB_TAB: Tab = { href: "/lab", label: "Лаб", icon: ICONS.lab };

/** «Календарь» (D-78): one screen for every role, so both bars carry the same tab. */
const CALENDAR_TAB: Tab = { href: "/calendar", label: "Календарь", icon: ICONS.calendar };

const EMPLOYEE_TABS: Tab[] = [
  { href: "/feed", label: "Лента", icon: ICONS.feed },
  { href: "/tasks", label: "Дела", icon: ICONS.tasks },
  CALENDAR_TAB,
  { href: "/rating", label: "Рейтинг", icon: ICONS.rating },
  { href: "/profile", label: "Профиль", icon: ICONS.profile },
  LAB_TAB,
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
  ],
};

/**
 * A screen without a tab of its own lights the tab it is entered from, so the bar always
 * says where one is (D-112): a task opens from «Задачи», «Команда» lives in «Настройки»,
 * the announcements in Пульс and Лента, the shop behind «Рейтинг» (D-59, docs/FRONTEND.md).
 */
const SECTIONS: Record<TabRole, Record<string, string>> = {
  director: { "/tasks": "/sent", "/people": "/settings", "/shop": "/settings", "/ether": "/pulse", "/confirm": "/pulse" },
  employee: { "/ether": "/feed", "/shop": "/rating" },
  secretary: { "/ether": "/feed", "/shop": "/rating", "/people": "/settings" },
};

/** The lit tab and whether the screen is that tab's own (`page`) or lives inside it. */
function activeTab(role: TabRole, pathname: string): { index: number; own: boolean } {
  const tabs = TABS[role];
  const within = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const own = tabs.findIndex((tab) => within(tab.href));
  if (own >= 0) return { index: own, own: true };
  const section = Object.entries(SECTIONS[role]).find(([base]) => within(base));
  return { index: section ? tabs.findIndex((tab) => tab.href === section[1]) : -1, own: false };
}

/**
 * What each role should not miss, as a count on its tab: the employee's tasks not yet
 * accepted on «Дела», everything waiting for the director on «Пульс». Live through the
 * same queries the screens use, so the number never disagrees with the list behind it.
 */
function useTabBadges(role: TabRole): Record<string, number> {
  const me = useMe();
  const mine = useMyTasks(role !== "director" ? me.data?.userId : undefined);
  const inbox = useDirectorInbox(me.data, role === "director");
  if (role !== "director") {
    const fresh = (mine.data ?? []).filter((task) => task.status === "sent").length;
    return fresh > 0 ? { "/tasks": fresh } : {};
  }
  const total = inboxCounts(inbox.data).total;
  return total > 0 ? { "/pulse": total } : {};
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
 * The on-screen keyboard is up (the visual viewport lost its bottom to it). The capsule
 * steps away and what docks above it lands on the keyboard instead of floating a bar's
 * height over it (D-112) — the keyboard leaves little enough room as it is.
 */
function useKeyboardUp(): boolean {
  return useVisualViewport() > 0;
}

/**
 * Where the thumb stood last. A tab in another layout mounts a new bar, and the thumb
 * slides on from here instead of appearing in place; a count that changed pops once,
 * one that is merely re-mounted does not.
 */
let lastIndex = -1;
const seenBadges = new Map<string, number>();

const THUMB = { stiffness: 520, damping: 38, mass: 0.9 };

/**
 * The thumb rides a spring measured in columns and stretches with its own speed — a drop
 * of light pulled across the glass, round again when it lands. Transform only.
 */
function useThumb(index: number, from: number) {
  const reduce = useReducedMotion();
  const pos = useSpring(Math.max(from, 0), THUMB);
  useEffect(() => {
    if (index < 0) return;
    if (reduce) pos.jump(index);
    else pos.set(index);
  }, [index, reduce, pos]);
  const x = useTransform(pos, (column) => `${column * 100}%`);
  const speed = useVelocity(pos);
  const stretch = useTransform(speed, (v) => 1 + Math.min(Math.abs(v) * 0.03, 0.34));
  return { x, stretch };
}

/**
 * Bottom navigation (D-112): a floating glass capsule over the screen. A raised accent
 * thumb slides to the chosen tab the moment it is tapped (the route catches up), the
 * chosen icon rises and says its name; the others are icons with their names for
 * assistive tech — eight tabs never truncate to «Кале…». Scrolling down folds the capsule.
 * Everything that docks above the bar sits at `--tabbar-space` and wears `.above-tabbar`.
 */
export function TabBar({ role }: { role: TabRole }) {
  const pathname = usePathname();
  const badges = useTabBadges(role);
  const nav = useRef<HTMLElement>(null);
  useFold(nav, pathname);
  const away = useKeyboardUp();
  const tabs = TABS[role];

  // the thumb answers the tap, not the network: it leaves before the next screen arrives.
  // The tap is forgotten once the route moves — back from «Дела» to «Лента» in the same
  // layout must not find the thumb still on «Дела»
  const [tapped, setTapped] = useState<number | null>(null);
  const [tappedOn, setTappedOn] = useState(pathname);
  if (tappedOn !== pathname) {
    setTappedOn(pathname);
    setTapped(null);
  }
  const route = activeTab(role, pathname);
  const index = tapped ?? route.index;
  const [from] = useState(() => (lastIndex >= 0 ? lastIndex : index));
  const thumb = useThumb(index, from);

  useEffect(() => {
    if (index >= 0) lastIndex = index;
  }, [index]);

  useEffect(() => {
    for (const tab of tabs) seenBadges.set(tab.href, badges[tab.href] ?? 0);
  });

  // before paint, in the same commit as the composer's own keyboard offset: no frame of it
  // hanging a bar's height over the keyboard
  useLayoutEffect(() => {
    if (nav.current) syncDocked(nav.current);
  }, [away]);
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
      <div aria-hidden className={styles.scrim} data-away={away ? "" : undefined} />
      <MotionConfig reducedMotion="user">
        <nav
          ref={nav}
          aria-label="Основная навигация"
          className={styles.capsule}
          data-away={away ? "" : undefined}
          style={{ "--n": tabs.length } as CSSProperties}
        >
          <motion.span
            aria-hidden
            className={styles.thumb}
            style={{ x: thumb.x }}
            initial={{ opacity: index >= 0 ? 1 : 0 }}
            animate={{ opacity: index >= 0 ? 1 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.span className={styles.stretch} style={{ scaleX: thumb.stretch }}>
              <span className={styles.lamp} />
              <span className={styles.pill} />
            </motion.span>
          </motion.span>
          <ul className={styles.row}>
            {tabs.map((tab, i) => {
              const active = i === index;
              const count = badges[tab.href] ?? 0;
              const seen = seenBadges.get(tab.href);
              const pop = seen !== undefined && seen !== count;
              return (
                <li key={tab.href} className="min-w-0">
                  <Link
                    href={tab.href}
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
                        <span key={count} className={`nums ${styles.badge} ${pop ? styles.badgePop : ""}`} aria-hidden>
                          {count > 99 ? "99+" : count}
                        </span>
                      ) : null}
                    </span>
                    <span className={styles.label} aria-hidden>
                      {tab.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </MotionConfig>
    </>
  );
}
