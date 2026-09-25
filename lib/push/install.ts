"use client";

import { useSyncExternalStore } from "react";

import { INSTALL_READY } from "@/lib/push/install-catcher";

/**
 * «Установить Pulse» (D-125). On Android a push of a site that is not installed arrives on
 * behalf of Chrome — «Chrome · pulse…vercel.app» in the header; the installed app (WebAPK)
 * gets its own name and its own notification settings. The offer is caught before hydration
 * by the root layout (lib/push/install-catcher.ts) and read here from `window`.
 */

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallWindow = Window & { __pulseInstall?: InstallEvent | null };

function offer(): InstallEvent | null {
  return typeof window === "undefined" ? null : ((window as InstallWindow).__pulseInstall ?? null);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(INSTALL_READY, onChange);
  return () => window.removeEventListener(INSTALL_READY, onChange);
}

/** Chrome's own install dialog; resolves to whether the person installed. The offer is single-use. */
async function install(): Promise<boolean> {
  const event = offer();
  if (!event) return false;
  (window as InstallWindow).__pulseInstall = null;
  window.dispatchEvent(new Event(INSTALL_READY));
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === "accepted";
}

/** Whether this browser offers to install Pulse now (Android Chrome, not installed yet). */
export function useInstallOffer(): { canInstall: boolean; install: () => Promise<boolean> } {
  const canInstall = useSyncExternalStore(subscribe, () => offer() !== null, () => false);
  return { canInstall, install };
}
