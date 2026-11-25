"use client";

import Link from "next/link";

import { useUncheckedReportsCount } from "@/lib/daily-report/review";
import { uncheckedText } from "@/lib/daily-report/team-feed";
import { useMe } from "@/lib/tasks/queries";

/**
 * The way into «Отчёты» from the director's Pulse (D-198, owner's answer 8): one grey line among
 * the service lines — «Отчёты · 3 не проверены ›» → the feed under «Не проверены». Only while there
 * is something to check (the last 7 days); never red, never the brand colour: unchecked is not an
 * alarm. No new ball, no tap on the way to «Сказать» (principle 1).
 */
export function TeamReportsLine() {
  const me = useMe();
  const director = me.data?.role === "director";
  const count = useUncheckedReportsCount(me.data?.companyId, director);
  if (!director || !count) return null;
  return (
    <Link href="/reports?only=new" className="card-in relative block py-1 pl-4 text-[15px] leading-5" data-testid="pulse-reports-line">
      <span aria-hidden className="absolute left-0 top-[8px] h-2 w-2 rounded-full bg-muted" />
      Отчёты <span className="nums text-muted">· {uncheckedText(count)}</span> <span className="text-muted">›</span>
    </Link>
  );
}
