import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";

import s from "./remote.module.css";

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
      <div className={`${s.lcd} mt-3`}>
        <div className="flex items-center justify-between">
          <Bone h={12} w={96} />
          <Bone h={12} w={40} />
        </div>
        <Bone h={24} w={200} className="mt-3" />
        <Bone h={14} w={120} className="mt-2" />
      </div>
      <div className="mt-3 flex gap-2">
        <Bone h={60} className="rounded-[18px]" />
        <Bone h={60} w={60} className="shrink-0 rounded-full" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Bone h={66} className="rounded-[18px]" />
        <Bone h={66} className="rounded-[18px]" />
        <Bone h={66} className="rounded-[18px]" />
      </div>
      <div className="mt-2 flex h-[5px] justify-around" />
      <Bone h={16} w={180} className="mt-2" />
      <Bone h={60} className="mt-3 rounded-[18px]" />
    </SkeletonGroup>
  );
}

/** The whole `/screen` page while loading: header, remote, the channel list. */
export function ScreenPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Экран в кабинете</h1>
      <p className="mt-1 text-[13px] leading-[18px] text-muted">Пульт от телевизора: что сейчас на стене и что показать</p>
      <RemoteSkeleton />
      <h2 className="eyebrow mt-6 px-1">Кого показать</h2>
      <SkeletonGroup className="mt-2">
        <Bone h={44} className="rounded-[12px]" />
        <div className="mt-2 card overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex min-h-[58px] items-center gap-3 px-4">
              <Bone h={36} w={36} round />
              <div className="flex-1">
                <Bone h={16} w="60%" />
                <Bone h={12} w="40%" className="mt-1.5" />
              </div>
            </div>
          ))}
        </div>
      </SkeletonGroup>
    </main>
  );
}
