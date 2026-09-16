"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { inboxCounts, useDirectorInbox, useMe, useMyTasks } from "@/lib/tasks/queries";

type TabRole = "director" | "employee";

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
};

const TABS: Record<TabRole, Tab[]> = {
  // D-59: four tabs each — the announcements live inside Пульс and Лента, the team inside Настройки
  director: [
    { href: "/pulse", label: "Пульс", icon: ICONS.pulse },
    { href: "/sent", label: "Задачи", icon: ICONS.tasks },
    { href: "/settings", label: "Настройки", icon: ICONS.settings },
    { href: "/profile", label: "Профиль", icon: ICONS.profile },
  ],
  employee: [
    { href: "/feed", label: "Лента", icon: ICONS.feed },
    { href: "/tasks", label: "Дела", icon: ICONS.tasks },
    { href: "/rating", label: "Рейтинг", icon: ICONS.rating },
    { href: "/profile", label: "Профиль", icon: ICONS.profile },
  ],
};

/**
 * What each role should not miss, as a count on its tab: the employee's tasks not yet
 * accepted on «Дела», everything waiting for the director on «Пульс». Live through the
 * same queries the screens use, so the number never disagrees with the list behind it.
 */
function useTabBadges(role: TabRole): Record<string, number> {
  const me = useMe();
  const mine = useMyTasks(role === "employee" ? me.data?.userId : undefined);
  const inbox = useDirectorInbox(role === "director");
  if (role === "employee") {
    const fresh = (mine.data ?? []).filter((task) => task.status === "sent").length;
    return fresh > 0 ? { "/tasks": fresh } : {};
  }
  const total = inboxCounts(inbox.data).total;
  return total > 0 ? { "/pulse": total } : {};
}

/** Bottom navigation: icon + label, 44px targets, safe-area aware (docs/FRONTEND.md). */
export function TabBar({ role }: { role: TabRole }) {
  const pathname = usePathname();
  const badges = useTabBadges(role);

  return (
    <nav
      className="sticky bottom-0 z-10 border-t border-border bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Основная навигация"
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS[role].map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[58px] flex-col items-center justify-center gap-0.5 px-1 pb-1.5 pt-2 font-display text-[11px] leading-4 tracking-[-0.01em] transition-colors duration-[120ms]"
                style={{ color: active ? "var(--accent)" : "var(--text-muted)", fontWeight: active ? 600 : 500 }}
              >
                <span
                  className="relative flex h-8 w-12 items-center justify-center rounded-full transition-colors duration-[120ms]"
                  style={{ background: active ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent" }}
                >
                  {tab.icon}
                  {badges[tab.href] ? (
                    <span
                      className="nums absolute -right-0.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface px-1 font-display text-[10px] font-bold leading-none"
                      style={{ background: "var(--accent)", color: "var(--bg)" }}
                      aria-label={`${badges[tab.href]} требуют внимания`}
                    >
                      {badges[tab.href] > 99 ? "99+" : badges[tab.href]}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
