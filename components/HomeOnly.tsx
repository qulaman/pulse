"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The home screens: the director's Пульс and the team's Лента (lib/routes.ts `homeForRole`). */
const HOME = new Set(["/pulse", "/feed"]);

/**
 * Shows its children on the home screens only. The layout that renders the brand bar stays
 * mounted while the route changes under it, so the choice is made here, in the browser —
 * every other screen has its own navigation bar (D-113).
 */
export function HomeOnly({ children }: { children: ReactNode }) {
  const path = usePathname();
  return HOME.has(path) ? children : null;
}
