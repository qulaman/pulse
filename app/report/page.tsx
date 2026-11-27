"use client";

import { useState } from "react";

import { MyReportView } from "@/components/daily-report/MyReportView";
import { MyTabel } from "@/components/daily-report/MyTabel";
import type { Pop } from "@/components/daily-report/PointsPop";
import { ReportSkeleton } from "@/components/daily-report/Skeletons";
import { LoadFailed } from "@/components/daily-report/TeamDayPanel";
import { PageHead } from "@/components/ui/PageHead";
import { useMyDailyReport, useMyDailyReportHistory, useRefreshAfterReplay, useSubmitDailyReport } from "@/lib/daily-report/queries";
import { isNetworkError } from "@/lib/net";
import { useNow } from "@/lib/useNow";

/**
 * «Отчёт за день» (D-152) — the tab «Отчёты» of the team's bar (D-219): the data and the submit;
 * the screen itself is `MyReportView`, which takes everything as props, the month's «Табель» —
 * `MyTabel`. The day and the past days are live: a director's «Просмотрено» / «Проверено» lands
 * without a reload (D-198).
 */
export default function ReportPage() {
  const day = useMyDailyReport();
  const history = useMyDailyReportHistory();
  const submit = useSubmitDailyReport();
  useRefreshAfterReplay();
  const now = useNow();
  const [pop, setPop] = useState<Pop | null>(null);

  if (day.isPending) return <ReportSkeleton />;
  if (!day.data) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
        <PageHead title="Отчёт за день" tone="muted" />
        <LoadFailed title="Не получилось загрузить отчёт" onRetry={() => void day.refetch()} />
      </main>
    );
  }

  // on the phone, not on the server yet: paused offline, retrying a dead network, or given up
  // on it for this session (the outbox still holds it)
  const waiting =
    submit.isPaused ||
    (submit.isPending && isNetworkError(submit.failureReason)) ||
    (submit.isError && isNetworkError(submit.error));

  return (
    <MyReportView
      day={day.data}
      history={history.isError ? [] : history.items}
      more={{ hasMore: history.hasMore, onMore: history.loadMore, loading: history.loadingMore, failed: history.moreFailed }}
      now={now}
      waiting={waiting}
      pop={pop}
      tabel={<MyTabel day={day.data} />}
      onSubmit={(input) =>
        submit.mutate(input, {
          // game feel after the write, over the screen (принцип 1a)
          onSuccess: (result) => {
            if (result.points_awarded > 0) setPop({ key: Date.now(), amount: result.points_awarded });
          },
        })
      }
    />
  );
}
