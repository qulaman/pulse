import { Sandbox } from "./Sandbox";

/** /dev/tasks?role=director|employee[&empty=1] — the task screens on fixtures (dev only). */
export default async function TasksSandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const role = params.role === "employee" ? "employee" : "director";
  return <Sandbox key={`${role}-${params.empty ?? ""}`} role={role} empty={params.empty === "1"} />;
}
