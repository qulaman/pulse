import { BoardSkeleton } from "@/components/ui/PageSkeletons";

/** Route skeleton: identical to what the board shows while its queries run — nothing shifts. */
export default function Loading() {
  return <BoardSkeleton />;
}
