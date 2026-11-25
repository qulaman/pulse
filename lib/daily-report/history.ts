/**
 * «Прошлые отчёты» as cards (7.6): a run of missed days in a row is one card, not twenty red ones —
 * «29 окт. – 20 нояб. · 16 не сдано · без штрафа». Pure, no React.
 *
 * A missed day is red only when it cost points (`points < 0`); a miss that cost nothing — before the
 * first report (D-155 §1), points off — is said in grey, as the form under it promises. An excused
 * day keeps its own card: it carries the director's words.
 */
import { pluralRu } from "@/lib/tasks/status-text";

import { pointsText } from "./format";
import type { DailyReport } from "./types";

/** Missed days in a row that fold into one card. */
export const FOLD_MIN = 3;

export type HistoryItem =
  | { kind: "day"; report: DailyReport }
  | {
      kind: "gap";
      /** The newest and the oldest day of the run (the list is newest first). */
      newest: string;
      oldest: string;
      /** The days of the run, newest first. */
      reports: DailyReport[];
      /** What the run cost, net (≤ 0). */
      points: number;
    };

/** A plain miss: not handed in, not excused. */
function plainMiss(report: DailyReport): boolean {
  return report.status === "missed" && !report.excused_at;
}

/** A miss that cost points — the only one drawn red. */
export function finedMiss(report: Pick<DailyReport, "status" | "points" | "excused_at">): boolean {
  return report.status === "missed" && !report.excused_at && report.points < 0;
}

/** Newest-first reports → cards: runs of `min` and more plain misses in a row folded, the rest as they are. */
export function foldHistory(items: readonly DailyReport[], min: number = FOLD_MIN): HistoryItem[] {
  const out: HistoryItem[] = [];
  let run: DailyReport[] = [];
  const flush = () => {
    if (run.length >= min) {
      out.push({ kind: "gap", newest: run[0].report_date, oldest: run[run.length - 1].report_date, reports: run, points: run.reduce((sum, report) => sum + Math.min(0, report.points), 0) });
    } else {
      for (const report of run) out.push({ kind: "day", report });
    }
    run = [];
  };
  for (const report of items) {
    if (plainMiss(report)) {
      run.push(report);
      continue;
    }
    flush();
    out.push({ kind: "day", report });
  }
  flush();
  return out;
}

/** The grey line of a folded run: «16 дней без отчёта · без штрафа» / «5 дней без отчёта · −50». */
export function gapLine(gap: Extract<HistoryItem, { kind: "gap" }>): string {
  const n = gap.reports.length;
  return [`${n} ${pluralRu(n, ["день", "дня", "дней"])} без отчёта`, gap.points < 0 ? pointsText(gap.points) : "без штрафа"].join(" · ");
}
