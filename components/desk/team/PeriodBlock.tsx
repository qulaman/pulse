"use client";

import { useDeskScope } from "@/components/desk/DeskScope";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { PERIOD_DAYS, SHORT_LABEL, STEADY, usePersonPeriod } from "@/lib/people/period";

import { LoadFailed } from "./shared";

const TITLE = `За ${PERIOD_DAYS} дней`;
const NOTHING = `За ${PERIOD_DAYS} дней сданных задач и отчётов нет`;
const WHAT = `итоги за ${PERIOD_DAYS} дней`;

/**
 * «За 30 дней» of a person, the director's (lib/people/period.ts), in one line for the right-hand
 * panel: the numbers and how they moved against the 30 days before.
 */
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
