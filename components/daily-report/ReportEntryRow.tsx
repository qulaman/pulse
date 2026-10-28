"use client";

import Link from "next/link";

import { Icon } from "@/components/tasks/desk/icons";
import { HapticSwitch } from "@/components/ui/HapticSwitch";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { entryState } from "@/lib/daily-report/format";
import { useMyDailyReport, useRefreshAfterReplay } from "@/lib/daily-report/queries";

import { ReportDoneIcon, ReportIcon } from "./icons";

const TONE = {
  ok: { tile: "color-mix(in srgb, var(--ok) 15%, transparent)", fg: "var(--ok)" },
  accent: { tile: "color-mix(in srgb, var(--accent) 15%, transparent)", fg: "var(--accent)" },
  muted: { tile: "var(--surface-2)", fg: "var(--text-muted)" },
} as const;

/**
 * «Отчёт за день» on «Дела» (D-152): one row with the day's state — «не сдан», «сдан в 18:04»,
 * «выходной» — a tap opens /report. Its box stands from the first paint (the skeleton draws the
 * same, `ReportEntryRowBone`); with reports off, or a database that does not answer, it is not there.
 */
export function ReportEntryRow() {
  const day = useMyDailyReport();
  // a submit the outbox delivered on this start turns the row green without a reload
  useRefreshAfterReplay();

  if (day.isError || day.data?.enabled === false) return null;
  const state = day.data ? entryState(day.data) : null;
  const tone = TONE[state?.tone ?? "accent"];

  return (
    <Link
      href="/report"
      className="card relative mt-2 flex min-h-[56px] items-center gap-3 px-3.5 transition-transform duration-[120ms] active:scale-[0.99]"
      data-testid="report-entry"
    >
      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: tone.tile, color: tone.fg }}>
        {state?.tone === "ok" ? <ReportDoneIcon /> : <ReportIcon />}
      </span>
      <span className="min-w-0 flex-1 font-display text-[16px] font-semibold leading-[22px] tracking-[-0.01em]">Отчёт за день</span>
      {state ? (
        <span className="nums flex shrink-0 items-center gap-1 text-[13px] font-semibold leading-4" style={{ color: tone.fg }}>
          {state.tone === "ok" ? <Icon name="check" size={14} /> : null}
          {state.text}
        </span>
      ) : (
        <SkeletonGroup>
          <Bone h={16} w={72} />
        </SkeletonGroup>
      )}
      <span className="shrink-0 text-muted">
        <Icon name="open" size={14} />
      </span>
      <HapticSwitch />
    </Link>
  );
}
