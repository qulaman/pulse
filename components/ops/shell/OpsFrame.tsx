"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { PulseMark } from "@/components/brand/PulseMark";
import { FreshPrompt } from "@/components/ops/FreshPrompt";
import { failureText } from "@/components/ops/shell/failure";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { opsFetch } from "@/lib/ops/client";
import { OPS_LOGIN_PATH } from "@/lib/ops/paths";

type Section = { href: string; label: string; icon: string; active: (pathname: string) => boolean };

const SECTIONS: Section[] = [
  {
    href: "/ops",
    label: "Компании",
    icon: "M5 20.5V5.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M14 10h4a1 1 0 0 1 1 1v9.5M3.5 20.5h17M8 8.5h3M8 12h3M8 15.5h3",
    active: (pathname) => pathname === "/ops" || pathname === "/ops/new" || pathname.startsWith("/ops/c/"),
  },
  {
    href: "/ops/log",
    label: "Журнал",
    icon: "M6 3.5h8.5L19 8v12.5H6zM14.5 3.5V8H19M9 12.5h6.5M9 16h4",
    active: (pathname) => pathname.startsWith("/ops/log"),
  },
  {
    href: "/ops/operators",
    label: "Разработчики",
    icon: "M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13",
    active: (pathname) => pathname.startsWith("/ops/operators"),
  },
];

function SectionLink({ section, active }: { section: Section; active: boolean }) {
  return (
    <Link
      href={section.href}
      prefetch
      aria-current={active ? "page" : undefined}
      className={`desk-focus relative flex h-9 w-full items-center gap-2.5 rounded-[10px] px-3 text-[14px] font-medium leading-5 transition-colors duration-[120ms] ${
        active ? "bg-surface-2/60 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text"
      }`}
    >
      {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-accent" /> : null}
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-accent" : ""}>
        <path d={section.icon} />
      </svg>
      <span className="min-w-0 flex-1 truncate">{section.label}</span>
    </Link>
  );
}

/**
 * The console's frame (D-157): a narrow column of sections with whoever is signed in at its foot,
 * the screen in `#desk-main` — the desk's own scroll and text selection, none of its shell: the
 * product's side navigation asks for a company this console does not have. Registers the prompt
 * for a fresh code.
 */
export function OpsFrame({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);

  const logout = async () => {
    setLeaving(true);
    try {
      await opsFetch<{ ok: true }>("/api/ops/auth/logout", { method: "POST" });
      window.location.assign(OPS_LOGIN_PATH);
    } catch (failure) {
      setLeaving(false);
      toast(failureText(failure));
    }
  };

  return (
    <div className="grid h-dvh grid-cols-[200px_minmax(0,1fr)] overflow-hidden bg-bg" data-testid="ops-frame">
      <nav aria-label="Разделы консоли" className="flex min-h-0 flex-col border-r border-border bg-surface/60 px-3 pb-3 pt-4">
        <div className="mb-6 flex h-9 items-center gap-2 px-1">
          <PulseMark />
          <span className="eyebrow">Консоль</span>
        </div>
        <ul className="flex min-h-0 flex-col gap-0.5">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <SectionLink section={section} active={section.active(pathname)} />
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-1 border-t border-border pt-3">
          <p className="truncate px-2 text-[13px] leading-5 text-muted" title={email} data-testid="ops-email">
            {email}
          </p>
          <Button size="sm" variant="ghost" className="justify-start !px-2" loading={leaving} onClick={() => void logout()} data-testid="ops-logout">
            Выйти
          </Button>
        </div>
      </nav>
      {/* `isolate`: the screen's light sits under the content, inside the screen */}
      <main id="desk-main" className="relative isolate min-h-0 min-w-0 overflow-y-auto">
        {children}
      </main>
      <FreshPrompt />
    </div>
  );
}
