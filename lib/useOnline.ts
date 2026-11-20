"use client";

import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

// the same switch that pauses and resumes mutations — a screen never disagrees with the queue
const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);
const online = () => onlineManager.isOnline();

/** Only the network, as the mutation queue sees it. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, online, () => true);
}

/** The same answer outside React (handlers, effects). */
export function isOnline(): boolean {
  return onlineManager.isOnline();
}
