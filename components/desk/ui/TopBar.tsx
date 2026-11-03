"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CommandLine } from "@/components/desk/CommandLine";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { useSettled } from "@/components/desk/ui/SideNav";
import { MessageButton, VisitorButton } from "@/components/visits/VisitorButton";
import { goPhoneView } from "@/lib/desk/device";
import type { DeskRole } from "@/lib/desk/routes";
import { shortName, useNamesKey } from "@/lib/people/names";
import { ROLE_LABEL } from "@/lib/people/queries";
import { homeForRole } from "@/lib/routes";
import { useVisits } from "@/lib/visits/queries";

/**
 * Who is signed in, as a circle with a menu (D-154): the name and the role, «Профиль», «Телефонная
 * версия». It used to be a line of small words in the corner; the corner is the order line's now.
 */
function MeMenu({ fullName, role }: { fullName: string; role: DeskRole }) {
  useNamesKey();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        aria-label={`${fullName}, ${ROLE_LABEL[role].toLowerCase()}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors duration-[120ms] hover:bg-surface-2"
        data-testid="desk-me"
      >
        <Avatar name={fullName} size={32} />
        <span className="hidden max-w-[140px] truncate text-[13px] font-medium leading-4 xl:block">{shortName(fullName)}</span>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-40 w-[240px] overflow-hidden rounded-[12px] border border-border bg-surface py-1" style={{ boxShadow: "var(--shadow-raised)" }}>
          <div className="px-3.5 pb-2 pt-1.5">
            <p className="truncate text-[14px] font-semibold leading-5">{fullName}</p>
            <p className="text-[12px] leading-4 text-muted">{ROLE_LABEL[role]}</p>
          </div>
          <div className="border-t border-border/70 pt-1">
            <Link href="/desk/profile" role="menuitem" onClick={() => setOpen(false)} className="block px-3.5 py-2 text-[14px] leading-5 hover:bg-surface-2">
              Профиль
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => goPhoneView(homeForRole(role))}
              className="block w-full px-3.5 py-2 text-left text-[14px] leading-5 hover:bg-surface-2"
              data-testid="phone-view"
            >
              Телефонная версия
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The secretary's two calls to the director, on top of every desk screen (D-96, D-116): a visitor
 * at the door and a message for the wall — the same sheets as on her phone, dialogs here.
 */
function SecretaryCalls() {
  // asked after the screen hydrated: the errands screen under it draws the same visits (D-143)
  const settled = useSettled();
  const visits = useVisits(settled);
  const rows = visits.data ?? [];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 [&_button.card-in]:min-h-[40px] [&_button.card-in]:text-[14px]" data-testid="desk-secretary-calls">
      <span className="mr-1 text-[13px] leading-4 text-muted">Директору:</span>
      <VisitorButton visits={rows} />
      <MessageButton visits={rows} />
    </div>
  );
}

/**
 * Over every desk screen: the director's order line across the width (D-153 §5) — the secretary's
 * calls to the director in its place (В-11 а: she gives no orders); on the right — who is signed
 * in, with the way to the profile and back to the phone screens.
 */
export function TopBar({ fullName, role }: { fullName: string; role: DeskRole }) {
  return (
    <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-border px-6">
      {role === "director" ? <CommandLine /> : <SecretaryCalls />}
      <div className="ml-auto" />
      <MeMenu fullName={fullName} role={role} />
    </header>
  );
}
