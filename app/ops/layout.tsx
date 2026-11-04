import type { Metadata } from "next";
import type { ReactNode } from "react";

import { OpsProviders } from "@/components/ops/shell/OpsProviders";

export const metadata: Metadata = {
  title: "Консоль Pulse",
  robots: { index: false, follow: false, nocache: true },
};

/** The developers' console (D-157, tasks/029), outside every company. `data-surface="desk"` goes on <html> in OpsProviders. */
export default function OpsLayout({ children }: { children: ReactNode }) {
  return <OpsProviders>{children}</OpsProviders>;
}
