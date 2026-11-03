import { Suspense } from "react";

import { ReportsDesk } from "@/components/desk/reports/ReportsDesk";

/** «Отчёты» on the desk (D-152, tasks/022 B.5): the director's; `?tab=period` opens the period. */
export default function DeskReportsPage() {
  return (
    <Suspense>
      <ReportsDesk />
    </Suspense>
  );
}
