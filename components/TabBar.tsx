"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabRole = "director" | "employee";

type Tab = { href: string; label: string };

const TABS: Record<TabRole, Tab[]> = {
  director: [
    { href: "/pulse", label: "Пульс" },
    { href: "/ether", label: "Эфир" },
    { href: "/profile", label: "Профиль" },
  ],
  employee: [
    { href: "/feed", label: "Лента" },
    { href: "/tasks", label: "Дела" },
    { href: "/ether", label: "Эфир" },
    { href: "/profile", label: "Профиль" },
  ],
};

/** Bottom navigation: 44px tap targets, safe-area aware (docs/FRONTEND.md). */
export function TabBar({ role }: { role: TabRole }) {
  const pathname = usePathname();

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
                className="flex min-h-[44px] items-center justify-center px-3 py-3 text-[14px] font-medium"
                style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
