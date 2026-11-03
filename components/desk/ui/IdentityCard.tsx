"use client";

import { initialsOf, ROLE_LABEL } from "@/lib/people/queries";
import type { Role } from "@/lib/routes";

/** Who is signed in: the initials, the name, the role and the company. */
export function IdentityCard({ fullName, role, company }: { fullName: string; role: Role; company: string }) {
  return (
    <div className="card flex items-center gap-4 px-5 py-4">
      <span
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-[16px] font-bold text-bg"
        style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
      >
        {initialsOf(fullName)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-display text-[18px] font-bold leading-6">{fullName}</p>
        <p className="truncate text-[14px] leading-5 text-muted">
          {ROLE_LABEL[role]} · {company}
        </p>
      </div>
    </div>
  );
}
