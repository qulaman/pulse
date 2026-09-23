import { TaskSandbox } from "./TaskSandbox";

/** /dev/task?id=fx-1&role=director|employee — one task's own screen on fixtures (dev only). */
export default async function TaskSandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const role = params.role === "employee" ? "employee" : "director";
  const id = params.id ?? "fx-1";
  return <TaskSandbox key={`${role}-${id}`} role={role} id={id} />;
}
