"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { PageTitle } from "@/components/desk/ui/PageTitle";
import { LabScreen } from "@/components/lab/LabScreen";
import { parseLabTab } from "@/lib/lab/tabs";

/**
 * «Лаборатория» on the desk (D-63): the phone's screen with its benches — the director and the
 * secretary are both admins of the lab. `?tab=models|parser|costs` opens a tab; the shelf of
 * pages (`/lab/about`, `/lab/tech`, `/lab/mascot`, `/lab/haptics`) opens them as they are.
 */
export default function DeskLabPage() {
  const params = useSearchParams();
  const [tab] = useState(() => parseLabTab(params.get("tab") ?? undefined));
  return (
    <div className="flex w-full max-w-[1100px] flex-col">
      <PageTitle title="Лаборатория" state={{ text: "модели, разбор и себестоимость" }} />
      <LabScreen tab={tab} admin bare />
    </div>
  );
}
