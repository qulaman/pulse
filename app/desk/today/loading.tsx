import { TodaySkeleton } from "@/components/desk/today/TodayScreen";

/** The route loads: the screen's frame in place, nothing jumps when it lands (D-122). */
export default function Loading() {
  return <TodaySkeleton />;
}
