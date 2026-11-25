import { Suspense } from "react";

import { ReportsDesk } from "@/components/desk/reports/ReportsDesk";

// «Подряд» (D-198): the feed of reports and its marks; after the desk's sheets (app/desk/layout.tsx), so a tie is its
import "../reports-feed.css";

/** «Отчёты» on the desk (D-152, D-183, D-198): «Подряд» and «Табель»; `?tab=period` and `?day&p` still open. */
export default function DeskReportsPage() {
  return (
    <Suspense>
      <ReportsDesk />
    </Suspense>
  );
}
