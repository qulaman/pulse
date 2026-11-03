"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { LabDesk } from "@/components/desk/settings/lab/LabDesk";
import { parseLabTab } from "@/lib/lab/tabs";

/**
 * «Лаборатория» on the desk (D-63): the director's and the secretary's bench. `?tab=models|parser|costs`
 * opens a tab; the shelf of pages (`/lab/about`, `/lab/tech`, `/lab/mascot`, `/lab/haptics`) opens
 * them in a new browser tab.
 */
export default function DeskLabPage() {
  const params = useSearchParams();
  const [tab] = useState(() => parseLabTab(params.get("tab") ?? undefined));
  return <LabDesk initialTab={tab} />;
}
