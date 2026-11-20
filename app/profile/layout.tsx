import { TabShell } from "@/components/TabShell";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <TabShell>{children}</TabShell>;
}
