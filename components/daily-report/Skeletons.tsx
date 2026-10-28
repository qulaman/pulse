/**
 * The daily report's screens before their data (D-122): each draws its screen down to the first
 * block whose place the data decides, then one `grow` placeholder. Used twice — by the route's
 * loading.tsx and by the page while its query runs — so the picture never changes between the
 * tap and the data. Server-safe: no hooks, no function props, no values from client modules.
 */
import { Icon } from "@/components/tasks/desk/icons";
import { PageHead } from "@/components/ui/PageHead";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";

import { DayStepper } from "./DayStepper";
import { ReportIcon } from "./icons";
import { Segments } from "./Segments";

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
      <PageHead eyebrow={DATE_BONE} title="Отчёт за день" state={" "} />
      <SkeletonGroup grow className="mt-3">
        <div className="card p-4">
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((i) => (
              <div key={i}>
                <Bone h={16} w={56} className="mb-1 ml-1" />
                <Bone h={44} className="rounded-[12px]" />
              </div>
            ))}
          </div>
          <Bone h={16} w={120} className="ml-1 mt-2" />
        </div>
        <Bone h={16} w={128} className="ml-1 mt-6" />
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

/** The «Отчёт за день» row of «Дела», its state still grey — the same box as `ReportEntryRow`. */
export function ReportEntryRowBone() {
  return (
    <div className="card mt-2 flex min-h-[56px] items-center gap-3 px-3.5" aria-hidden>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}
      >
        <ReportIcon />
      </span>
      <span className="min-w-0 flex-1 font-display text-[16px] font-semibold leading-[22px] tracking-[-0.01em]">Отчёт за день</span>
      <SkeletonGroup>
        <Bone h={16} w={72} />
      </SkeletonGroup>
      <span className="shrink-0 text-muted">
        <Icon name="open" size={14} />
      </span>
    </div>
  );
}

const REPORT_TABS = [
  { key: "day", label: "День" },
  { key: "period", label: "Период" },
] as const;

/** «Отчёты» of the director: the head, the two views, the day switch, then the day itself. */
export function ReportsSkeleton() {
  return (
    <main className={MAIN}>
      <PageHead title="Отчёты" />
      <Segments id="reports-tab" label="Вид отчётов" items={REPORT_TABS} value="day" className="mt-3" />
      <div className="mt-4">
        <DayStepper date={null} today={null} />
        <TeamDayBone />
      </div>
    </main>
  );
}

/** The team's day while it loads: the summary card, then people rows. */
export function TeamDayBone() {
  return (
    <SkeletonGroup grow className="mt-3">
      <SummaryBone />
      <Bone h={16} w={96} className="ml-1 mt-5" />
      <div className="mt-2 flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <PersonBone key={i} wide={i % 2 === 0} />
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** The period while it loads: the summary with its strip, then the table. */
export function TeamPeriodBone() {
  return (
    <SkeletonGroup grow className="mt-3">
      <SummaryBone strip />
      <div className="mt-5 flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <PersonBone key={i} wide={i % 2 === 1} />
        ))}
      </div>
    </SkeletonGroup>
  );
}

function SummaryBone({ strip = false }: { strip?: boolean }) {
  return (
    <div className="status-screen rounded-[22px] px-4 pb-3 pt-3">
      <div className="flex items-center justify-between">
        <Bone h={16} w={124} />
        <Bone h={16} w={72} />
      </div>
      <div className="mt-2 flex min-h-[52px] items-center gap-3.5">
        <Bone h={46} w={56} className="rounded-[14px]" />
        <div className="flex-1">
          <Bone h={20} w="62%" />
          <Bone h={14} w="80%" className="mt-2" />
        </div>
      </div>
      <Bone h={8} className="mt-3 rounded-full" />
      <div className="mt-2 flex min-h-[18px] gap-3.5">
        <Bone h={16} w={72} className="mt-px" />
        <Bone h={16} w={84} className="mt-px" />
      </div>
      {strip ? <Bone h={120} className="mt-4 rounded-[12px]" /> : null}
    </div>
  );
}

function PersonBone({ wide }: { wide: boolean }) {
  return (
    <div className="task-card flex items-center gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5">
      <Bone h={40} w={40} round className="shrink-0" />
      <div className="flex-1">
        <Bone h={20} w={wide ? "48%" : "36%"} />
        <Bone h={14} w={wide ? "72%" : "58%"} className="mt-1" />
      </div>
    </div>
  );
}
