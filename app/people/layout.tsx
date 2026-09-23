import { AdminShell } from "@/components/AdminShell";

/** «Команда» and the person's card: the director and the secretary (D-104). */
export default function PeopleLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
