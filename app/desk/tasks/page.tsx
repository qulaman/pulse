"use client";

import { Suspense } from "react";

import { TasksScreen, TasksSkeleton } from "@/components/desk/tasks/TasksScreen";

/** «Задачи» of the desk (D-153, tasks/022 A): the screen reads its address — `?tab`, `?who`, `?q`, `?id`. */
export default function Page() {
  return (
    <Suspense fallback={<TasksSkeleton />}>
      <TasksScreen />
    </Suspense>
  );
}
