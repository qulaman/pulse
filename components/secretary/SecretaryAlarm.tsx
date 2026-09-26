"use client";

import dynamic from "next/dynamic";

import { useMe } from "@/lib/tasks/queries";

// The alarm screen — the secretary's face, the room, its CSS and the settings parser — loads
// only for a secretary: mounted in the root layout, it used to ride in every page's bundle,
// the login screen included (D-126).
const SecretaryAlarm = dynamic(() => import("./SecretaryAlarmScreen").then((m) => m.SecretaryAlarm), { ssr: false });

/**
 * Mounted once in the root layout: whatever screen a secretary is on — Лента, a task, the
 * calendar, the profile — the alarm reaches it. Anybody else, and a signed-out page, get
 * nothing.
 */
export function SecretaryAlarmGate() {
  const me = useMe();
  if (me.data?.role !== "secretary") return null;
  return <SecretaryAlarm meId={me.data.userId} />;
}
