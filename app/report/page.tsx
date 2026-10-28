"use client";

import { useState } from "react";

import { MyReportView } from "@/components/daily-report/MyReportView";
import type { Pop } from "@/components/daily-report/PointsPop";
import { ReportSkeleton } from "@/components/daily-report/Skeletons";
import { LoadFailed } from "@/components/daily-report/TeamDayPanel";
import { useMinute } from "@/components/tasks/list/TaskList";
import { PageHead } from "@/components/ui/PageHead";
import {
  useMyDailyReport,
  useMyDailyReportHistory,
  useRefreshAfterReplay,
  useSubmitDailyReport,
} from "@/lib/daily-report/queries";
import { isNetworkError } from "@/lib/net";

/**
 * «Отчёт за день» (D-152): the data and the submit; the screen itself is `MyReportView`, which
 * takes everything as props.
 */
export default function ReportPage() {
  const day = useMyDailyReport();
  const history = useMyDailyReportHistory();
  const submit = useSubmitDailyReport();
  useRefreshAfterReplay();
  const now = useMinute();
  const [pop, setPop] = useState<Pop | null>(null);

  if (day.isPending) return <ReportSkeleton />;
  if (!day.data) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
        <PageHead title="Отчёт за день" />
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
      history={history.isError ? [] : history.data}
      now={now}
      waiting={waiting}
      pop={pop}
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
