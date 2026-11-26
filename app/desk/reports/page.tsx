import { Suspense } from "react";

import { ReportsDesk } from "@/components/desk/reports/ReportsDesk";

// the feed of reports and its marks (D-198, D-201); after the desk's sheets (app/desk/layout.tsx), so a tie is its
import "../reports-feed.css";

/** «Отчёты» on the desk (D-152, D-183, D-198, D-201): the «Табель» card over the feed folded by days; `?tab=tabel`, `?tab=period` and `?day&p` still open. */
export default function DeskReportsPage() {
  return (
    <Suspense>
      <ReportsDesk />
    </Suspense>
  );
}
