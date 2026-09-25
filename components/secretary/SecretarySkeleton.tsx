"use client";

import { useTabRole } from "@/components/RoleScope";
import { PageHead } from "@/components/ui/PageHead";
import { SectionBone, SkeletonGroup } from "@/components/ui/Skeleton";

/**
 * «Заявки» before the data (D-79): the page's own head, then the place where the first block
 * will stand — the director's numbers card, or the secretary's request cards a step higher.
 * Page and route share it (D-122).
 */
export function SecretarySkeleton() {
  const director = useTabRole() === "director";
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead title="Заявки" />
      <SkeletonGroup grow className={director ? "mt-4" : "mt-3"}>
        <SectionBone fields={3} />
      </SkeletonGroup>
    </main>
  );
}
