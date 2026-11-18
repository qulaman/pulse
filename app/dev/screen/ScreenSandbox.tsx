"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import ScreenPage from "@/app/(director)/screen/page";

/** The remote as the director's phone draws it; the query client is handed to the driver that plays the wall. */
export function ScreenSandbox() {
  const queryClient = useQueryClient();
  useEffect(() => {
    (window as unknown as { __remoteQueryClient?: unknown }).__remoteQueryClient = queryClient;
  }, [queryClient]);
  return (
    <div className="min-h-dvh bg-bg">
      <ScreenPage />
    </div>
  );
}
