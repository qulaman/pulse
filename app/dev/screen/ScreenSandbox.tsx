"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Remote } from "@/components/screen/Remote";

import { cutNetwork, frozenNowOf, seedScreen, WALL_CASE, type ScreenCase } from "./fixtures";

/**
 * The remote as the director's phone draws it. With a case — seeded and cut off the network before
 * it mounts; without one — the query client is handed to a driver that plays the wall.
 */
export function ScreenSandbox({ screenCase }: { screenCase: ScreenCase | null }) {
  const queryClient = useQueryClient();
  // the fixtures live in the browser only: the server's first picture is empty, not a remote that would not match
  const client = useSyncExternalStore(noop, () => true, () => false);
  // seeded in the first render, before the remote's queries mount and ask the network
  useState(() => {
    if (typeof window === "undefined" || !screenCase) return null;
    cutNetwork();
    seedScreen(queryClient, screenCase);
    return null;
  });
  useEffect(() => {
    (window as unknown as { __remoteQueryClient?: unknown }).__remoteQueryClient = queryClient;
  }, [queryClient]);
  return (
    <div className="min-h-dvh bg-bg">
      {!client ? null : screenCase ? <Remote wallSrc={`/dev/tv?case=${WALL_CASE[screenCase]}`} frozenNow={frozenNowOf(screenCase)} /> : <Remote />}
    </div>
  );
}

function noop(): () => void {
  return () => {};
}
