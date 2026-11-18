"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import { DeskScope } from "@/components/desk/DeskScope";
import { DeskScreen } from "@/components/desk/screen/DeskScreen";

import { cutNetwork, frozenNowOf, seedScreen, type ScreenCase } from "../fixtures";

const ME = { userId: "d1", companyId: "c1", role: "director" as const, isActive: true, fullName: "Директор" };

/** The desk's «Экран» in a bare desk frame («Графит»), seeded before it mounts. */
export function DeskScreenSandbox({ screenCase }: { screenCase: ScreenCase }) {
  const queryClient = useQueryClient();
  // the fixtures live in the browser only: the server's first picture is empty, not a remote that would not match
  const client = useSyncExternalStore(noop, () => true, () => false);
  useState(() => {
    if (typeof window === "undefined") return null;
    cutNetwork();
    seedScreen(queryClient, screenCase);
    return null;
  });
  // the desk's look (D-171) lives on the document, as the shell sets it
  useEffect(() => {
    document.documentElement.setAttribute("data-graphite", "");
  }, []);
  return (
    <div data-desk="" className="min-h-dvh bg-bg">
      <main id="desk-main" className="relative isolate">
        {client ? (
          <DeskScope me={ME} role="director" pointsEnabled>
            <DeskScreen frozenNow={frozenNowOf(screenCase)} />
          </DeskScope>
        ) : null}
      </main>
    </div>
  );
}

function noop(): () => void {
  return () => {};
}
