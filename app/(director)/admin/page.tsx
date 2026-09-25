"use client";

import { useState } from "react";

import { DataTable } from "@/components/admin/DataTable";
import { TableChips } from "@/components/admin/tables";
import { ADMIN_TABLES as TABLES } from "@/lib/admin/tables";
import { PageHead } from "@/components/ui/PageHead";

/**
 * Admin: the company's tables as readable grids. Read-only, under the director's RLS —
 * nothing here can see another company (V-02) and nothing here writes.
 */
export default function AdminPage() {
  const [active, setActive] = useState(TABLES[0].table);
  const spec = TABLES.find((t) => t.table === active) ?? TABLES[0];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-36">
      <PageHead title="Данные" />

      <TableChips active={active} onPick={setActive} />

      <div className="mt-4">
        <DataTable key={spec.table} spec={spec} />
      </div>
    </main>
  );
}
