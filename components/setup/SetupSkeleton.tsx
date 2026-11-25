import { PageHead } from "@/components/ui/PageHead";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";

/**
 * «Подключение» before the phone has been asked (D-122): the head with its «Позже», the line under
 * it and the four steps — closed cards of the real height; what opens inside them is the data's.
 * Server-safe: the route's loading.tsx draws it too.
 */
export function SetupSkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-16">
      <PageHead title="Подключение" back={{ label: "Позже", href: "/profile" }} tone="muted" state={" "} />
      <SkeletonGroup grow className="mt-3">
        <div className="px-1">
          <Bone h={16} />
          <Bone h={16} w="88%" className="mt-[5px]" />
          <Bone h={16} w="40%" className="mt-[5px]" />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card flex min-h-[64px] items-center gap-3 px-4 py-3">
              <Bone round w={26} h={26} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <Bone h={18} w={150} />
                <Bone h={13} w={90} className="mt-1.5" />
              </span>
            </div>
          ))}
        </div>
      </SkeletonGroup>
    </main>
  );
}
