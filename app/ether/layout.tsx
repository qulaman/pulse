import { TabShell } from "@/components/TabShell";

/** Shared screen: any signed-in role (docs/FRONTEND.md routing table). */
export default function EtherLayout({ children }: { children: React.ReactNode }) {
  return <TabShell>{children}</TabShell>;
}
