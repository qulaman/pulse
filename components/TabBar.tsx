"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
  ether: (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
      <path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
    </svg>
  ),
  profile: (
    <svg width="24" height="24" viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  ),
};

const TABS: Record<TabRole, Tab[]> = {
  director: [
    { href: "/pulse", label: "Пульс", icon: ICONS.pulse },
    { href: "/ether", label: "Эфир", icon: ICONS.ether },
    { href: "/profile", label: "Профиль", icon: ICONS.profile },
  ],
  employee: [
    { href: "/feed", label: "Лента", icon: ICONS.feed },
    { href: "/tasks", label: "Дела", icon: ICONS.tasks },
    { href: "/ether", label: "Эфир", icon: ICONS.ether },
    { href: "/profile", label: "Профиль", icon: ICONS.profile },
  ],
};

/** Bottom navigation: icon + label, 44px targets, safe-area aware (docs/FRONTEND.md). */
export function TabBar({ role }: { role: TabRole }) {
  const pathname = usePathname();

  return (
    <nav
      className="sticky bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur"
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
                className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-2 pb-1.5 pt-2 text-[11px] font-medium leading-4 transition-colors duration-[120ms]"
                style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
              >
                <span
                  className="flex h-7 w-11 items-center justify-center rounded-full transition-colors duration-[120ms]"
                  style={{ background: active ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent" }}
                >
                  {tab.icon}
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
