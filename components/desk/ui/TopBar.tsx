"use client";

import { CommandLine } from "@/components/desk/CommandLine";
import { goPhoneView } from "@/lib/desk/device";
import { shortName, useNamesKey } from "@/lib/people/names";
import { ROLE_LABEL } from "@/lib/people/queries";
import { homeForRole } from "@/lib/routes";
import type { DeskRole } from "@/lib/desk/routes";

/**
 * Over every desk screen: the director's order line across the width (D-153 §5) — the
 * secretary has none (В-11 а); on the right — who is signed in and the way back to the phone
 * screens.
 */
export function TopBar({ fullName, role }: { fullName: string; role: DeskRole }) {
  useNamesKey();
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border px-6">
      {role === "director" ? <CommandLine /> : <div className="flex-1" />}
      <div className="flex shrink-0 items-center gap-2 text-[13px] leading-4">
        <span className="max-w-[160px] truncate font-medium">{shortName(fullName)}</span>
        <span className="text-muted">·</span>
        <span className="text-muted">{ROLE_LABEL[role].toLowerCase()}</span>
        <span className="text-muted">·</span>
        <button
          type="button"
          onClick={() => goPhoneView(homeForRole(role))}
          className="text-muted underline-offset-4 transition-colors duration-[120ms] hover:text-text hover:underline"
          data-testid="phone-view"
        >
          Телефонная версия
        </button>
      </div>
    </header>
  );
}
