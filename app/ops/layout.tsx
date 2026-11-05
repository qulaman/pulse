import type { Metadata } from "next";
import type { ReactNode } from "react";

import { OpsProviders } from "@/components/ops/shell/OpsProviders";

export const metadata: Metadata = {
  title: "Консоль Pulse",
  robots: { index: false, follow: false, nocache: true },
};

/** Before the first paint, or a hard load flashes the desk's look until hydration; OpsProviders keeps them from there. */
const OPS_SURFACE_SCRIPT = `(function(r){r.dataset.surface="desk";r.dataset.ops=""})(document.documentElement)`;

/** The developers' console (D-157, tasks/029), outside every company. */
export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: OPS_SURFACE_SCRIPT }} />
      <OpsProviders>{children}</OpsProviders>
    </>
  );
}
