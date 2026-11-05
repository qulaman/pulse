"use client";

import { useDeskScope } from "@/components/desk/DeskScope";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { PERIOD_DAYS, SHORT_LABEL, STEADY, usePersonPeriod, type PeriodLine } from "@/lib/people/period";

import { Block, LoadFailed } from "./shared";

const TITLE = `За ${PERIOD_DAYS} дней`;
const NOTHING = `За ${PERIOD_DAYS} дней сданных задач и отчётов нет`;
const WHAT = `итоги за ${PERIOD_DAYS} дней`;

function Line({ line }: { line: PeriodLine }) {
  return (
    <div className="grid min-h-[34px] grid-cols-[minmax(0,1fr)_auto_96px] items-baseline gap-x-4 py-[6px]" data-period={line.key}>
      <span className="truncate text-[14px] leading-5 text-muted">{line.label}</span>
      <span className="nums whitespace-nowrap text-[14px] leading-5">
        <span className={line.value === "0" ? "text-muted/60" : undefined}>{line.value}</span>
        {line.detail ? <span className="text-muted"> · {line.detail}</span> : null}
      </span>
      <span className={`whitespace-nowrap text-right text-[13px] leading-5 text-muted ${line.change === STEADY ? "" : "nums"}`}>{line.change}</span>
    </div>
  );
}

/**
 * «За 30 дней» on a person's card, the director's (lib/people/period.ts): what they handed in, how
 * much by the deadline, what came back, their reports, each against the 30 days before. What could
 * not be read says so in a line and takes no zero in its place; nothing happened — one phrase.
 */
export function PeriodBlock({ personId, now }: { personId: string; now: Date }) {
  const { pointsEnabled } = useDeskScope();
  const period = usePersonPeriod(personId, now, pointsEnabled);
  const compared = period.lines.some((line) => line.change !== null);
  return (
    <Block title={TITLE} testId="desk-person-period" end={compared ? <span className="text-[12px] leading-4 text-muted">к прошлым {PERIOD_DAYS} дням</span> : null}>
      {period.loading ? (
        <SkeletonGroup>
          <Bone h={34} />
        </SkeletonGroup>
      ) : (
        <>
          {period.lines.length > 0 ? (
            <div className="desk-list">
              {period.lines.map((line) => (
                <Line key={line.key} line={line} />
              ))}
            </div>
          ) : period.failed ? null : (
            <p className="text-[13px] leading-[18px] text-muted">{NOTHING}</p>
          )}
          {period.failed ? <LoadFailed what={WHAT} onRetry={period.retry} /> : null}
        </>
      )}
    </Block>
  );
}

/** The same in one line, for the right-hand panel: the numbers and how they moved. */
export function PeriodPeek({ personId, now }: { personId: string; now: Date }) {
  const { pointsEnabled } = useDeskScope();
  const period = usePersonPeriod(personId, now, pointsEnabled);
  return (
    <section className="flex flex-col gap-1" data-testid="person-peek-period">
      <SectionLabel>{TITLE}</SectionLabel>
      {period.loading ? (
        <SkeletonGroup>
          <Bone h={20} />
        </SkeletonGroup>
      ) : (
        <>
          {period.lines.length > 0 ? (
            <p className="flex flex-wrap gap-x-3 text-[13px] leading-5 text-muted">
              {period.lines.map((line) => (
                <span key={line.key} className="whitespace-nowrap" data-period={line.key}>
                  {SHORT_LABEL[line.key]} <span className="nums text-text">{line.value}</span>
                  {line.change && line.change !== STEADY ? <span className="nums"> {line.change}</span> : null}
                </span>
              ))}
            </p>
          ) : period.failed ? null : (
            <p className="text-[13px] leading-5 text-muted">{NOTHING}</p>
          )}
          {period.failed ? <LoadFailed what={WHAT} onRetry={period.retry} /> : null}
        </>
      )}
    </section>
  );
}
