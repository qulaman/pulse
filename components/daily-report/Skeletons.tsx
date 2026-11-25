/**
 * The daily report's screens before their data (D-122): each draws its screen down to the first
 * block whose place the data decides, then one `grow` placeholder. Used twice — by the route's
 * loading.tsx and by the page while its query runs — so the picture never changes between the
 * tap and the data. Server-safe: no hooks, no function props, no values from client modules.
 */
import { PageHead } from "@/components/ui/PageHead";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";


const MAIN = "mx-auto w-full max-w-lg flex-1 px-4 pb-36";

/** The date above the title, still grey: the day comes with the data. */
const DATE_BONE = (
  <SkeletonGroup>
    <Bone h={16} w={148} />
  </SkeletonGroup>
);

/** «Отчёт за день»: the head with its state line held, then the form and the past days as one block. */
export function ReportSkeleton() {
  return (
    <main className={MAIN}>
      <PageHead eyebrow={DATE_BONE} title="Отчёт за день" tone="muted" state={" "} />
      {/* D-198: no «Пришёл / Ушёл» card — the day's tasks come first */}
      <SkeletonGroup grow className="mt-4">
        <Bone h={16} w={128} className="ml-1" />
        <div className="card mt-2 overflow-hidden">
          {[0, 1].map((i) => (
            <div key={i} className={`flex min-h-[56px] items-center gap-3 px-3.5 ${i ? "border-t border-border/70" : ""}`}>
              <Bone h={20} w={20} round className="shrink-0" />
              <div className="flex-1">
                <Bone h={18} w={i ? "52%" : "70%"} />
                <Bone h={13} w={96} className="mt-1" />
              </div>
            </div>
          ))}
        </div>
        <Bone h={16} w={120} className="ml-1 mt-6" />
        <Bone h={112} className="mt-2 rounded-[12px]" />
      </SkeletonGroup>
    </main>
  );
}

/** «Прошлые отчёты» while they load: cards of a past day. */
export function HistoryBone() {
  return (
    <SkeletonGroup grow className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="task-card flex gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5">
          <Bone h={8} w={8} round className="mt-[7px] shrink-0" />
          <div className="flex-1">
            <Bone h={20} w={i % 2 ? "38%" : "46%"} />
            <Bone h={14} w="64%" className="mt-1" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
