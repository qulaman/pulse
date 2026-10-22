import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { PageHead } from "@/components/ui/PageHead";

/**
 * Скелет магазина: заголовок и подпись настоящие, пульсирует только то, что придёт
 * из базы, — карточка баланса и четыре места под товары (docs/FRONTEND.md).
 * Server-safe: тем же скелетом живёт loading.tsx маршрута.
 */
export function ShopSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Магазин" />
      <SkeletonGroup grow className="mt-4 space-y-2">
        {/* the balance card of ShopFront: «Очки», the 44 px number, the line under it */}
        <Bone h={110} className="rounded-[16px]" />
        {Array.from({ length: 4 }, (_, i) => (
          <Bone key={i} h={112} className="rounded-[16px]" />
        ))}
      </SkeletonGroup>
    </main>
  );
}
