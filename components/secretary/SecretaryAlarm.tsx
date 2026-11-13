"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { RefObject } from "react";

import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";

// The alarm screen — the secretary's face, the room, its CSS and the settings parser — loads
// only for a secretary: mounted in the root layout, it used to ride in every page's bundle,
// the login screen included (D-126).
const SecretaryAlarm = dynamic(() => import("./SecretaryAlarmScreen").then((m) => m.SecretaryAlarm), { ssr: false });
// The computer's alarm (D-175): no mascot, no `tel:` — its own chunk, only for a secretary's desk.
const DeskAlarm = dynamic(() => import("@/components/desk/errands/DeskAlarm").then((m) => m.DeskAlarm), { ssr: false });

/** The desk's pages: the same test as the head script that puts `data-surface="desk"` on <html>. */
function onDesk(pathname: string | null): boolean {
  return pathname === "/desk" || Boolean(pathname?.startsWith("/desk/"));
}

/**
 * Mounted once in the root layout: whatever screen a secretary is on — Лента, a task, the
 * calendar, the profile — the alarm reaches it. Anybody else, and a signed-out page, get
 * nothing. Only after hydration: the server already knows `me` (the layout seeds it), and a
 * client-only `dynamic` draws other markup there than in the browser — React #418 threw away
 * every secretary page's server HTML and drew it anew (D-136). On the desk the phone's overlay
 * stands aside: the desk frame draws its own alarm over the work area (`DeskAlarmGate`).
 */
export function SecretaryAlarmGate() {
  const me = useMe();
  const hydrated = useHydrated();
  const pathname = usePathname();
  if (!hydrated || me.data?.role !== "secretary" || onDesk(pathname)) return null;
  return <SecretaryAlarm meId={me.data.userId} />;
}

/**
 * The desk's half of the gate (D-175), placed by DeskShell in the work area's column: for a
 * secretary, the alarm over `main` (the screen it covers) and its folded strip above it.
 */
export function DeskAlarmGate({ meId, role, main }: { meId: string; role: string; main: RefObject<HTMLElement | null> }) {
  const hydrated = useHydrated();
  if (!hydrated || role !== "secretary") return null;
  return <DeskAlarm meId={meId} main={main} />;
}
