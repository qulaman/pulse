"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useSetup } from "@/components/setup/useSetup";
import { writeMarks } from "@/lib/setup/marks";
import { shouldAutoOpen } from "@/lib/setup/steps";

/**
 * The first sign-in on a phone opens «Подключение» once, by itself (D-190): the team only — their
 * work arrives by push; not when everything is through; never again on this phone for this person,
 * whatever they did there («Позже» is an answer too). Renders nothing.
 */
export function SetupLaunch() {
  const setup = useSetup();
  const router = useRouter();
  const fired = useRef(false);
  const open = setup ? shouldAutoOpen({ team: setup.team, facts: setup.facts, marks: setup.marks, progress: setup.progress }) : false;
  const userId = setup?.userId;

  useEffect(() => {
    if (!open || !userId || fired.current) return;
    fired.current = true;
    writeMarks(userId, { seen: new Date().toISOString() });
    router.push("/setup?from=feed");
  }, [open, userId, router]);

  return null;
}
