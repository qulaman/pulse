import { PageHead } from "@/components/ui/PageHead";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";

/**
 * The picture of «Словарь» before its data (D-111). Server-safe — no hooks — so the
 * route's loading.tsx and the screen while its queries run draw the same thing.
 */

/** A person card of the names tab: avatar, name and position, a row of chips. */
function PersonBone() {
  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center gap-3">
        <Bone w={40} h={40} round className="shrink-0" />
        <div className="min-w-0 flex-1">
          <Bone h={20} w="55%" />
          <Bone h={14} w="30%" className="mt-1" />
        </div>
      </div>
      <div className="mt-3 flex gap-1.5">
        <Bone w={72} h={34} round />
        <Bone w={88} h={34} round />
        <Bone w={64} h={34} round />
      </div>
    </div>
  );
}

/** Everything under the tab switch: the guide, the check card, the search, the people. */
export function DictionaryBody() {
  return (
    <SkeletonGroup className="flex flex-col gap-2">
      <div className="flex min-h-[56px] items-center gap-3 card px-4 py-3">
        <Bone w={32} h={32} className="shrink-0" />
        <Bone h={22} w="48%" />
      </div>
      <div className="card px-4 py-4">
        <Bone h={22} w="40%" />
        <Bone h={16} w="70%" className="mt-1" />
        <Bone h={44} className="mt-3 rounded-[12px]" />
      </div>
      <Bone h={44} className="mt-4 rounded-[12px]" />
      <div className="mt-1 flex gap-2">
        <Bone w={72} h={34} round />
        <Bone w={150} h={34} round />
      </div>
      <PersonBone />
      <PersonBone />
      <PersonBone />
    </SkeletonGroup>
  );
}

/** The whole route while it loads: the static head, the switch, the body. */
export function DictionarySkeleton() {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-5">
      <DictionaryHead />
      <SkeletonGroup className="mt-5">
        <Bone h={50} className="rounded-[14px]" />
      </SkeletonGroup>
      <div className="mt-4">
        <DictionaryBody />
      </div>
    </main>
  );
}

/**
 * The head of the screen (D-109) is static text: it renders at once and is never a bone
 * (DESIGN §2, rule 2). «Назад» leads to the settings tab the page was opened from.
 */
export function DictionaryHead({ from }: { from?: "team" }) {
  return (
    <PageHead
      back={from === "team" ? { href: "/settings?tab=team", label: "Сотрудники" } : { href: "/settings?tab=ai", label: "Настройки" }}
      title="Словарь"
      sub="Как ИИ узнаёт людей и названия в вашей речи"
    />
  );
}
