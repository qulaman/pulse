import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";

/**
 * Скелет магазина: заголовок и подпись настоящие, пульсирует только то, что придёт
 * из базы, — карточка баланса и четыре места под товары (docs/FRONTEND.md).
 * Server-safe: тем же скелетом живёт loading.tsx маршрута.
 */
export function ShopSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <h1 className="text-[24px] font-bold leading-[30px]">Магазин</h1>
      <p className="mt-1 text-[13px] leading-4 text-muted">Очки за работу превращаются в награды</p>
      <SkeletonGroup className="mt-4 space-y-2">
        <Bone h={92} className="rounded-[16px]" />
        {Array.from({ length: 4 }, (_, i) => (
          <Bone key={i} h={112} className="rounded-[16px]" />
        ))}
      </SkeletonGroup>
    </main>
  );
}
