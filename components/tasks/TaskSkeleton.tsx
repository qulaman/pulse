import { SkeletonGroup, TaskListBone } from "@/components/ui/Skeleton";

/** Kept for existing call sites: the task-list block of the skeleton system. */
export function TaskSkeleton({ count = 3, variant = "employee" }: { count?: number; variant?: "employee" | "director" }) {
  return (
    <SkeletonGroup>
      <TaskListBone count={count} variant={variant} />
    </SkeletonGroup>
  );
}
