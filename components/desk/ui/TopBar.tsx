"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DirectorBusyLine } from "@/components/desk/calendar/DirectorBusyLine";
import { CommandLine } from "@/components/desk/CommandLine";
import { Menu, type MenuItem } from "@/components/desk/ui/Menu";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { openShortcuts } from "@/components/desk/ui/Shortcuts";
import { useSettled } from "@/components/desk/ui/SideNav";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { MessageButton, VisitorButton } from "@/components/visits/VisitorButton";
import { goPhoneView } from "@/lib/desk/device";
import { otherDeskTheme, useDeskTheme, writeDeskTheme } from "@/lib/desk/theme";
import { DESK_PROFILE, type DeskRole } from "@/lib/desk/routes";
import { shortName, useNamesKey } from "@/lib/people/names";
import { ROLE_LABEL } from "@/lib/people/queries";
import { homeForRole } from "@/lib/routes";
import { useVisits } from "@/lib/visits/queries";

/**
 * Who is signed in, as a circle with a menu (D-154): the name and the role, «Профиль», «Клавиши»,
 * the fold of the navigation, the theme, «Телефонная версия» — each with the key that does the same
 * (the desk's `Menu`: ↑/↓, Enter, Esc).
 */
function MeMenu({ fullName, role, folded, onToggleNav }: { fullName: string; role: DeskRole; folded: boolean; onToggleNav?: () => void }) {
  useNamesKey();
  const router = useRouter();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const theme = useDeskTheme();
  const items: MenuItem[] = [
    { key: "profile", label: "Профиль", hint: "G P", onSelect: () => router.push(DESK_PROFILE) },
    { key: "keys", label: "Клавиши", hint: "?", onSelect: openShortcuts },
    ...(onToggleNav ? [{ key: "fold", label: folded ? "Развернуть навигацию" : "Свернуть навигацию", hint: "[", onSelect: onToggleNav }] : []),
    { key: "theme", label: THEME_WORD[otherDeskTheme(theme)], onSelect: () => writeDeskTheme(otherDeskTheme(theme)) },
    "separator",
    { key: "phone", label: <span data-testid="phone-view">Телефонная версия</span>, onSelect: () => goPhoneView(homeForRole(role)) },
  ];

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={`${fullName}, ${ROLE_LABEL[role].toLowerCase()}`}
        aria-expanded={Boolean(anchor)}
        aria-haspopup="menu"
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
        className="desk-focus flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition-colors duration-[120ms] hover:bg-surface-2"
        data-testid="desk-me"
      >
        <Avatar name={fullName} size={32} />
        <span className="hidden max-w-[140px] truncate text-[13px] font-medium leading-4 xl:block">{shortName(fullName)}</span>
      </button>
      <Menu
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchor={anchor}
        align="end"
        width={260}
        label="Аккаунт"
        items={items}
        header={
          <>
            <p className="truncate text-[14px] font-semibold leading-5">{fullName}</p>
            <p className="text-[12px] leading-4 text-muted">{ROLE_LABEL[role]}</p>
          </>
        }
      />
    </div>
  );
}

const THEME_WORD = { dark: "Тёмная тема", light: "Светлая тема" } as const;

/** The sheet's two faces (D-159): one press, remembered by this browser; the icon shows where it leads. */
function ThemeButton() {
  const next = otherDeskTheme(useDeskTheme());
  return (
    <Tooltip label={THEME_WORD[next]} side="bottom">
      <button
        type="button"
        aria-label={THEME_WORD[next]}
        onClick={() => writeDeskTheme(next)}
        data-testid="desk-theme"
        data-next={next}
        className="desk-focus flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {next === "light" ? (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
            </>
          ) : (
            <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
          )}
        </svg>
      </button>
    </Tooltip>
  );
}

/** «?» in the corner: the help with every key, for a hand on the mouse. */
function KeysButton() {
  return (
    <Tooltip label="Клавиши" keys={["?"]} side="bottom">
      <button
        type="button"
        aria-label="Клавиши"
        onClick={openShortcuts}
        data-testid="desk-keys"
        className="desk-focus flex h-8 w-8 items-center justify-center rounded-full border border-border text-[14px] font-semibold leading-none text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
      >
        ?
      </button>
    </Tooltip>
  );
}

/**
 * The secretary's two calls to the director, on top of every desk screen (D-96, D-116): a visitor
 * at the door and a message for the wall — the same sheets as on her phone, dialogs here — and
 * whether he is free right now, in one line.
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
      <DirectorBusyLine />
    </div>
  );
}

/**
 * Over every desk screen: the director's order line across the width (D-153 §5) — the secretary's
 * calls to the director in its place (В-11 а: she gives no orders); on the right — who is signed
 * in, with the way to the profile and back to the phone screens.
 */
export function TopBar({ fullName, role, folded = false, onToggleNav }: { fullName: string; role: DeskRole; folded?: boolean; onToggleNav?: () => void }) {
  return (
    <header className="desk-head flex h-[72px] shrink-0 items-center gap-4 border-b border-border px-6">
      {role === "director" ? <CommandLine /> : <SecretaryCalls />}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ThemeButton />
        <KeysButton />
        <MeMenu fullName={fullName} role={role} folded={folded} onToggleNav={onToggleNav} />
      </div>
    </header>
  );
}
