"use client";

import { useBalance } from "@/lib/shop/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/**
 * The person's points under their name in the brand bar of Лента: the sum of the
 * transactions (принцип 4), live — an award or a shop hold changes it without a reload.
 * The line is there from the first paint, so the name above it never jumps.
 */
export function HeaderPoints({ userId }: { userId: string }) {
  const balance = useBalance(userId);
  const points = balance.data;
  return (
    <span className="nums block text-right text-[12px] font-semibold leading-4" style={{ color: "var(--gold)" }} data-testid="header-points">
      {points === undefined ? " " : `${points} ${pluralRu(Math.abs(points), ["очко", "очка", "очков"])}`}
    </span>
  );
}
