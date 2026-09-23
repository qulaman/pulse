import { AdminShell } from "@/components/AdminShell";

/** «Настройки»: the director and the secretary (D-104). */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
