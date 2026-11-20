import { TabShell } from "@/components/TabShell";

/** Shared screen: the shop is open to any signed-in role, same shell as «Рейтинг». */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <TabShell>{children}</TabShell>;
}
