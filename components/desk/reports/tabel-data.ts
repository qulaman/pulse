"use client";

import { useMemo, useState } from "react";

import { useTeamDailyReportPeriod } from "@/lib/daily-report/queries";
import { buildTabel, type Tabel } from "@/lib/daily-report/tabel";
import type { Ymd } from "@/lib/datetime/calendar";
import { useCompanySettings } from "@/lib/dictionary-queries";
import { usePeople } from "@/lib/people/queries";
import type { ReportPerson } from "@/lib/people/stats";
import { useMe } from "@/lib/tasks/queries";

import { usePeriodMarks } from "./marks";

export type { Tabel, TabelDay, TabelPerson } from "@/lib/daily-report/tabel";

/**
 * The period as a табель (D-183): the period RPC's people × the reports of each day (marks.ts) ×
 * the company's rules × each person's joining day, role and today's availability, through the
 * shared day state (lib/daily-report/tabel.ts). Both reads keep the last period on screen while
 * the next one comes; the табель is built only from answers about the same period, so a cell
 * never shows last month's report under this month's date — until then the last табель stays,
 * marked as placeholder. Live: a report handed in lands in its cell (marks.ts listens).
 */
export function useTabel(from: Ymd, to: Ymd, today: Ymd, enabled: boolean) {
  const me = useMe();
  const period = useTeamDailyReportPeriod(from, to, enabled);
  const marks = usePeriodMarks(from, to, enabled, me.data?.companyId);
  const settings = useCompanySettings();
  const people = usePeople(enabled);

  const roster = useMemo(() => {
    if (!people.data) return null;
    return new Map<string, ReportPerson>(people.data.map((person) => [person.id, person]));
  }, [people.data]);
  const rules = settings.data?.daily_report;
  // both answers are about the period asked, not the one before it
  const fresh = Boolean(period.data && marks.data && !period.isPlaceholderData && !marks.isPlaceholderData);

  const built = useMemo(() => {
    if (!fresh || !period.data || !marks.data || !rules || !roster) return null;
    return buildTabel({ from: period.data.from, to: period.data.to, today, rows: period.data.rows, marks: marks.data, rules, people: roster });
  }, [fresh, period.data, marks.data, rules, roster, today]);

  // the last табель built stays on screen while the next period is on its way
  const [last, setLast] = useState<Tabel | undefined>(undefined);
  if (built && built !== last) setLast(built);
  const data = built ?? last;

  const failed = [period, marks, settings, people].filter((query) => query.isError);
  return {
    data,
    isError: failed.length > 0,
    isPlaceholderData: !built && Boolean(data),
    isLoading: !data && failed.length === 0,
    refetch: () => {
      for (const query of failed.length ? failed : [period, marks]) void query.refetch();
    },
  };
}
