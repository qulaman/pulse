import { TabShell } from "@/components/TabShell";

/** Shared screen: any signed-in role, same shell as Эфир. */
export default function RatingLayout({ children }: { children: React.ReactNode }) {
  return <TabShell>{children}</TabShell>;
}
