import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";

/** A table while its rows land: the head and the lines of the real one, so the swap moves nothing. */
export function TableBones({ rows = 6, rowHeight = 35 }: { rows?: number; rowHeight?: number }) {
  return (
    <SkeletonGroup grow>
      <div className="ops-box overflow-hidden border">
        <div className="ops-table-head flex h-[29px] items-center border-b border-border px-3">
          <Bone h={8} w={84} />
        </div>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-6 border-b border-border/40 px-3 last:border-b-0" style={{ height: rowHeight }}>
            <Bone h={10} w={index % 2 === 0 ? 180 : 132} />
            <Bone h={10} w={72} className="ml-auto" />
            <Bone h={10} w={72} />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** The card's sections while it lands: words on the same line as the real tabs. */
export function TabBones({ tabs = 5 }: { tabs?: number }) {
  return (
    <SkeletonGroup>
      <div className="flex h-[35px] items-center gap-7 border-b border-border px-3">
        {Array.from({ length: tabs }, (_, index) => (
          <Bone key={index} h={10} w={52} />
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** The numbers of a company's card while it lands: the strip keeps its height. */
export function StatBones({ cells = 6 }: { cells?: number }) {
  return (
    <SkeletonGroup>
      <div className="ops-stats">
        {Array.from({ length: cells }, (_, index) => (
          <div key={index} className="ops-stat">
            <Bone h={8} w="60%" className="my-1" />
            <Bone h={14} w="44%" className="my-1" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}
