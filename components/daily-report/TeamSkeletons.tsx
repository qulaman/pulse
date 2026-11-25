/**
 * The director's «Отчёты» on the phone before their data (D-122): the screen down to the first
 * block whose place the data decides, then one `grow` placeholder. The route's loading.tsx and the
 * page while its query runs draw the same picture. Server-safe: no hooks, no function props.
 */
import { PageHead } from "@/components/ui/PageHead";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import type { ReportsTab } from "@/lib/daily-report/team-feed";

import { Segments } from "./Segments";

const MAIN = "mx-auto w-full max-w-lg flex-1 px-4 pb-36";

const TABS = [
  { key: "feed", label: "Подряд" },
  { key: "period", label: "Период" },
] as const;

/** The whole screen: the head, the two views, then the view itself. */
export function TeamReportsSkeleton({ tab = "feed" }: { tab?: ReportsTab }) {
  return (
    <main className={MAIN}>
      <PageHead title="Отчёты" />
      <Segments id="reports-tab" label="Вид отчётов" items={TABS} value={tab} className="mt-3" />
      <div className="mt-2.5">
        {tab === "feed" ? (
          <SkeletonGroup grow>
            <StripBone />
            <div className="mt-3 flex gap-2">
              <Bone h={34} w={58} className="rounded-full" />
              <Bone h={34} w={142} className="rounded-full" />
              <Bone h={34} w={112} className="rounded-full" />
            </div>
            <FeedDaysBone />
          </SkeletonGroup>
        ) : (
          <div className="mt-1.5">
            <PeriodBone />
          </div>
        )}
      </div>
    </main>
  );
}

/** «4 из 10 сдали сегодня · Ждём 4 ›» while the feed loads. */
export function StripBone() {
  return (
    <div className="flex h-[52px] items-center gap-3 rounded-[16px] border border-border/70 bg-surface/60 pl-3.5 pr-2">
      <Bone h={22} w={64} />
      <Bone h={14} w={96} />
      <Bone h={36} w={92} className="ml-auto rounded-[12px]" />
    </div>
  );
}

/** A day's head and its first reports. */
export function FeedDaysBone({ cards = 2 }: { cards?: number }) {
  return (
    <>
      <div className="flex min-h-[44px] items-center gap-2 px-1 pt-3">
        <Bone h={18} w={84} />
        <Bone h={14} w={120} />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: cards }, (_, i) => (
          <ReportCardBone key={i} long={i % 2 === 0} />
        ))}
      </div>
    </>
  );
}

/** One report card: the face, the name, three lines of words, the foot with «Проверить». */
export function ReportCardBone({ long = true }: { long?: boolean }) {
  return (
    <div className="task-card rounded-[18px] px-3.5 pb-3 pt-3.5">
      <div className="flex items-center gap-3">
        <Bone h={36} w={36} round className="shrink-0" />
        <div className="flex-1">
          <Bone h={18} w={long ? "46%" : "38%"} />
          <Bone h={13} w="28%" className="mt-1" />
        </div>
        <Bone h={14} w={36} />
      </div>
      <Bone h={15} className="mt-3" />
      <Bone h={15} w={long ? "92%" : "70%"} className="mt-1.5" />
      {long ? <Bone h={15} w="64%" className="mt-1.5" /> : null}
      <div className="mt-3 flex items-center">
        <Bone h={14} w={110} />
        <Bone h={44} w={124} className="ml-auto rounded-[12px]" />
      </div>
    </div>
  );
}

/** The period while it loads: the chips, then the rest. */
export function PeriodBone() {
  return (
    <SkeletonGroup grow>
      <div className="flex items-center gap-2">
        <Bone h={34} w={72} className="rounded-full" />
        <Bone h={34} w={68} className="rounded-full" />
        <Bone h={34} w={56} className="rounded-full" />
      </div>
      <PeriodRowsBody />
    </SkeletonGroup>
  );
}

/** The period under its chips while it loads: the summary with its strip, then the table. */
export function PeriodRowsBone() {
  return (
    <SkeletonGroup grow>
      <PeriodRowsBody />
    </SkeletonGroup>
  );
}

function PeriodRowsBody() {
  return (
    <>
      <div className="status-screen mt-3 rounded-[22px] px-4 pb-3 pt-3">
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
        <Bone h={120} className="mt-4 rounded-[12px]" />
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="task-card flex items-center gap-3 rounded-[16px] px-3.5 py-3">
            <Bone h={32} w={32} round className="shrink-0" />
            <div className="flex-1">
              <Bone h={18} w={i % 2 ? "48%" : "36%"} />
              <Bone h={13} w="40%" className="mt-1" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/** The team's day in the roll call sheet while it loads. */
export function RollCallBone() {
  return (
    <SkeletonGroup className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex min-h-[56px] items-center gap-3 px-1">
          <Bone h={36} w={36} round className="shrink-0" />
          <div className="flex-1">
            <Bone h={18} w={i % 2 ? "40%" : "52%"} />
            <Bone h={13} w="30%" className="mt-1" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
