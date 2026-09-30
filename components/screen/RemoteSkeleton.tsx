import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";

import s from "@/components/ui/device/device.module.css";
import { PageHead } from "@/components/ui/PageHead";

/**
 * The remote before its state arrives: the same body, the same boxes, grey where the
 * text will be (DESIGN §2 «Скелетоны»). Used by the route's loading.tsx and by the page
 * while `tv_state` and the people are in flight, so the picture never changes between
 * the tap and the data.
 */
export function RemoteSkeleton() {
  return (
    <SkeletonGroup className={`${s.body} mx-auto mt-4 w-full max-w-[380px]`}>
      <Bone h={14} w={64} className="mx-auto rounded-full" />
      {/* the display line for line: the eyebrow, what is on the wall, the receipt, the gauge's row */}
      <div className={`${s.lcd} mt-3`}>
        <div className="flex h-4 items-center justify-between">
          <Bone h={12} w={96} />
          <Bone h={12} w={40} />
        </div>
        <div className="mt-2 flex h-7 items-center">
          <Bone h={22} w={200} />
        </div>
        <div className="mt-1 flex h-[18px] items-center">
          <Bone h={13} w={120} />
        </div>
        <div className="mt-3 h-[3px]" />
      </div>
      <div className="mt-3 flex gap-2">
        <Bone h={60} className="rounded-[18px]" />
        <Bone h={60} w={60} className="shrink-0 rounded-full" />
      </div>
      {/* the scenes three across, each with its dot, the round last (D-123) — two rows with or without the rating */}
      <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col items-stretch gap-1.5">
            <Bone h={66} className="rounded-[18px]" />
            <span className="h-[5px]" />
          </div>
        ))}
      </div>
      {/* the hint under them always holds two lines */}
      <div className="mt-1 flex min-h-[36px] justify-center pt-[2px]">
        <Bone h={13} w={180} />
      </div>
      {/* the calendar view keys (D-98) */}
      <div className={`${s.seam}`} />
      <Bone h={16} w={140} className="mt-3 ml-1" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Bone h={60} className="rounded-[18px]" />
        <Bone h={60} className="rounded-[18px]" />
      </div>
      <div className={`${s.seam}`} />
      <Bone h={16} w={120} className="mt-3 ml-1" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Bone h={60} className="rounded-[18px]" />
        <Bone h={60} className="rounded-[18px]" />
      </div>
      <Bone h={60} className="mt-3 rounded-[18px]" />
      <div className={`${s.seam}`} />
      <Bone h={16} w={120} className="mt-3 ml-1" />
      <div className={`${s.pad} mt-2`}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Bone key={i} h={84} className="rounded-[18px]" />
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** The whole `/screen` page while loading: header, remote, the channel list. */
export function ScreenPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Экран в кабинете" />
      <RemoteSkeleton />
    </main>
  );
}
