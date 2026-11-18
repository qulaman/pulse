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
      {/* the display line for line: the eyebrow, what is on the wall, why, the receipt, the gauge's row */}
      <div className={`${s.lcd} mt-3`}>
        <div className="flex h-4 items-center justify-between">
          <Bone h={12} w={96} />
          <Bone h={12} w={40} />
        </div>
        <div className="mt-2 flex h-7 items-center">
          <Bone h={22} w={200} />
        </div>
        <div className="mt-0.5 flex h-[18px] items-center">
          <Bone h={13} w={220} />
        </div>
        <div className="mt-1 flex h-[18px] items-center">
          <Bone h={13} w={120} />
        </div>
        <div className="mt-3 h-[3px]" />
      </div>
      {/* «Кого показать» first (D-182): the seam's print and the people keys */}
      <div className={`${s.seam}`} />
      <Bone h={16} w={120} className="mt-3 ml-1" />
      <div className={`${s.pad} mt-2`}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Bone key={i} h={84} className="rounded-[18px]" />
        ))}
      </div>
      {/* the screensavers in one row, a name and a dot under each, and the hint's two lines */}
      <div className={`${s.seam}`} />
      <Bone h={16} w={100} className="mt-3 ml-1" />
      <div className="mt-2 grid grid-cols-6 gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col items-stretch gap-1">
            <Bone h={50} className="rounded-[18px]" />
            <span className="h-[14px]" />
            <span className="h-[5px]" />
          </div>
        ))}
      </div>
      <div className="mt-1.5 min-h-[36px]" />
    </SkeletonGroup>
  );
}

/** The whole `/screen` page while loading: header, remote, the channel list. */
export function ScreenPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Экран в кабинете" tone="muted" />
      <RemoteSkeleton />
    </main>
  );
}
