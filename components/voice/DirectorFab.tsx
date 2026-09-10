"use client";

import { usePathname } from "next/navigation";

import { IngestOverlay } from "@/components/voice/IngestOverlay";
import { VoiceButton } from "@/components/voice/VoiceButton";

/**
 * The director's input, present on every screen of the group (docs/FRONTEND.md "FAB").
 * On /confirm the button steps aside — that screen is about the phrase already spoken.
 */
export function DirectorFab() {
  const pathname = usePathname();

  return (
    <>
      {pathname === "/confirm" ? null : <VoiceButton />}
      <IngestOverlay />
    </>
  );
}
