"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { isOpsPath } from "@/lib/ops/paths";

/**
 * What belongs to a company's day (a session watcher, offline replays, push) has no business in
 * the developers' console (D-157). The address is read here and not in the root layout, which
 * must stay free of `headers()`: everywhere else this draws its children and nothing around them.
 */
export function NotOnOps({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return isOpsPath(pathname) ? null : <>{children}</>;
}
