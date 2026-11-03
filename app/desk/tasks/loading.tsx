import { TasksSkeleton } from "@/components/desk/tasks/TasksScreen";

/** The route loads: the screen's frame in place, nothing jumps when it lands (D-122). */
export default function Loading() {
  return <TasksSkeleton />;
}
