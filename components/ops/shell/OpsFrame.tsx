"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ShortcutsHelp, useShortcuts } from "@/components/desk/ui/Shortcuts";
import { PulseMark } from "@/components/brand/PulseMark";
import { FreshPrompt } from "@/components/ops/FreshPrompt";
import { failureText } from "@/components/ops/shell/failure";
import { Jump, typingIn } from "@/components/ops/shell/Jump";
import { keepReturnPath } from "@/components/ops/shell/returnPath";
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
      className={`desk-focus relative flex h-8 w-full items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] font-medium leading-5 ${
        active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/50 hover:text-text"
      }`}
    >
      {active ? <span aria-hidden className="absolute inset-y-1.5 left-0 w-[2px] bg-accent" /> : null}
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-accent" : ""}>
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
 * for a fresh code. A session that ends comes back to the same screen after the sign-in.
 */
export function OpsFrame({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);
  const signingOut = useRef(false);

  useShortcuts("Консоль", [
    { keys: ["Ctrl K"], label: "Перейти к компании или разделу" },
    { keys: ["/"], label: "Поиск на этом экране" },
  ]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Slash" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if (typingIn(event.target) || document.body.hasAttribute("data-dialog-open")) return;
      const field = document.querySelector<HTMLInputElement>("[data-ops-search] input");
      if (!field) return;
      event.preventDefault();
      field.focus();
      field.select();
    };
    const keep = () => keepReturnPath(signingOut.current ? null : window.location.pathname + window.location.search);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pagehide", keep);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pagehide", keep);
    };
  }, []);

  const logout = async () => {
    setLeaving(true);
    try {
      await opsFetch<{ ok: true }>("/api/ops/auth/logout", { method: "POST" });
      signingOut.current = true;
      window.location.assign(OPS_LOGIN_PATH);
    } catch (failure) {
      setLeaving(false);
      toast(failureText(failure));
    }
  };

  return (
    <div className="grid h-dvh grid-cols-[192px_minmax(0,1fr)] overflow-hidden bg-bg" data-testid="ops-frame">
      <nav aria-label="Разделы консоли" className="ops-frame-nav flex min-h-0 flex-col border-r border-border bg-surface/60 px-2.5 pb-2.5 pt-3.5">
        <div className="mb-4 flex h-8 items-center gap-2 px-1.5">
          <PulseMark />
          <span className="ops-tag">Консоль</span>
        </div>
        <div className="mb-2">
          <Jump />
        </div>
        <ul className="flex min-h-0 flex-col gap-0.5">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <SectionLink section={section} active={section.active(pathname)} />
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-1 border-t border-border pt-2.5">
          <p className="ops-data truncate px-2.5 leading-5" title={email} data-testid="ops-email">
            {email}
          </p>
          <Button size="sm" variant="ghost" className="w-full justify-start !px-2.5" loading={leaving} onClick={() => void logout()} data-testid="ops-logout">
            Выйти
          </Button>
        </div>
      </nav>
      {/* `isolate`: the screen's light sits under the content, inside the screen */}
      <main id="desk-main" className="relative isolate min-h-0 min-w-0 overflow-y-auto">
        {children}
      </main>
      <FreshPrompt />
      <ShortcutsHelp />
    </div>
  );
}
