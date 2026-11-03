import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";

/**
 * A desk screen while its route loads (D-122): the screen's own title in its place, and below it
 * one growing placeholder — what is under the title is decided by the data. Screens with a frame
 * of their own while the lists land (`TasksSkeleton`, `InboxSkeleton`) use theirs instead.
 */
export function DeskScreenBone({ title, width }: { title: string; width?: "wide" | "narrow" }) {
  return (
    <DeskPage width={width}>
      <PageTitle title={title} />
      <SkeletonGroup grow>
        <Bone h={36} w={320} className="rounded-[11px]" />
        <Bone h={420} className="mt-4 rounded-[12px]" />
      </SkeletonGroup>
    </DeskPage>
  );
}
