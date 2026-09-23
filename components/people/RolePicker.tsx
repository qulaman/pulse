"use client";

import type { ReactNode } from "react";

import { CrownIcon, CupIcon, GiftIcon, PeopleIcon, PersonIcon, TvIcon } from "@/components/settings/icons";
import { ROLE_ABOUT, ROLE_LABEL, type Role } from "@/lib/people/queries";

const ICON: Record<Role, ReactNode> = {
  employee: <PersonIcon />,
  manager: <PeopleIcon />,
  secretary: <CupIcon />,
  shopkeeper: <GiftIcon />,
  director: <CrownIcon />,
  tv: <TvIcon />,
};

function Option({ role, checked, onPick }: { role: Role; checked: boolean; onPick?: () => void }) {
  const body = (
    <>
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] transition-colors duration-[160ms]"
        style={
          checked
            ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }
            : { background: "var(--surface-2)", color: "var(--text-muted)" }
        }
      >
        {ICON[role]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[16px] font-semibold leading-5 tracking-[-0.01em]">{ROLE_LABEL[role]}</span>
        <span className="mt-0.5 block text-[13px] leading-4 text-muted">{ROLE_ABOUT[role]}</span>
      </span>
      {onPick ? (
        <span
          aria-hidden
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-[120ms]"
          style={{ borderColor: checked ? "var(--accent)" : "var(--border)" }}
        >
          <span
            className="h-[10px] w-[10px] rounded-full transition-transform duration-[160ms] ease-out"
            style={{ background: "var(--accent)", transform: checked ? "scale(1)" : "scale(0)" }}
          />
        </span>
      ) : null}
    </>
  );

  const base = "flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left";
  if (!onPick) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-testid={`role-${role}`}
      onClick={onPick}
      className={`${base} transition-colors duration-[120ms] active:bg-surface-2`}
      style={checked ? { background: "color-mix(in srgb, var(--accent) 7%, transparent)" } : undefined}
    >
      {body}
    </button>
  );
}

/**
 * The role as a choice of what the person will do, not a dropdown of words (D-104): each
 * role says in one line what it means, one tap picks it. `options` come from
 * `assignableRoles` — the secretary never sees «Директор». With `locked` the current
 * role is shown alone with the reason it cannot change here.
 */
export function RolePicker({
  value,
  options,
  onChange,
  locked,
}: {
  value: Role;
  options: Role[];
  onChange: (role: Role) => void;
  locked?: string;
}) {
  if (locked || options.length <= 1) {
    return (
      <div className="card overflow-hidden">
        <Option role={value} checked />
        {locked ? <p className="border-t border-border/70 px-4 py-3 text-[13px] leading-4 text-muted">{locked}</p> : null}
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label="Роль" className="card overflow-hidden [&>*+*]:border-t [&>*+*]:border-border/70">
      {options.map((role) => (
        <Option key={role} role={role} checked={role === value} onPick={() => onChange(role)} />
      ))}
    </div>
  );
}
