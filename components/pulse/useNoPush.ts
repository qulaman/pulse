"use client";

import { useMemo } from "react";

import { usePushHealth } from "@/lib/push/health-query";
import { noPushIds } from "@/lib/tasks/attention";

/**
 * The people whose pushes do not reach them (D-114) — for the director's verdict on Пульс: an order
 * whose assignee cannot hear about it is not «тихо» (`openingLine`, `alarmOf`). One Set for as long
 * as the list is the same: the health is read again every minute, and a new Set each time would
 * redo the face's opening for nothing.
 */
export function useNoPush(): ReadonlySet<string> {
  const health = usePushHealth().data;
  const key = useMemo(() => [...noPushIds(health)].sort().join(","), [health]);
  return useMemo(() => new Set(key ? key.split(",") : []), [key]);
}
