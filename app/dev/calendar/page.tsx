import { Sandbox } from "./Sandbox";

/** /dev/calendar?role=director|employee[&empty=1][&bones=1][&many=1] — the calendar screen on fixtures (dev only). */
export default async function CalendarSandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const role = params.role === "employee" ? "employee" : "director";
  return (
    <Sandbox
      key={`${role}-${params.empty ?? ""}-${params.bones ?? ""}-${params.many ?? ""}`}
      role={role}
      empty={params.empty === "1"}
      bones={params.bones === "1"}
      many={params.many === "1"}
    />
  );
}
