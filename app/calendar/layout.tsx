import { TabShell } from "@/components/TabShell";

/** «Календарь» (D-78): any signed-in role, in the role's own shell. */
export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <TabShell>{children}</TabShell>;
}
