import { CalendarSkeleton } from "@/components/ui/PageSkeletons";

/** Route skeleton: identical to what the page shows while its query runs — nothing shifts. */
export default function Loading() {
  return <CalendarSkeleton />;
}
