"use client";

import { useErrandReplay } from "@/lib/errands/pending";
import { useMe } from "@/lib/tasks/queries";

/**
 * Sends the requests to the secretary that the phone kept without network (D-106), from any
 * screen of the director: «Кофе» held in a lift lands the moment the phone finds a signal.
 * Only the director asks the secretary, so only the director's phone keeps such requests.
 */
export function ErrandReplay() {
  const me = useMe();
  useErrandReplay(me.data?.role === "director" ? me.data.userId : undefined);
  return null;
}
