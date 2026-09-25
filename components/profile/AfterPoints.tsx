"use client";

import type { ReactNode } from "react";

import { usePointHistory } from "@/lib/points/queries";

/**
 * What stands under the points card on «Профиль» — shown once the card knows its height. The
 * card grows with the last awards (up to three rows), and the rows under it jumped down when
 * they arrived; now they appear under a card that no longer moves (D-122). Without `userId`
 * (a director has no points card) the rows are there at once.
 */
export function AfterPoints({ userId, children }: { userId: string | null; children: ReactNode }) {
  const history = usePointHistory(userId ?? undefined);
  return userId && history.isPending ? null : children;
}
