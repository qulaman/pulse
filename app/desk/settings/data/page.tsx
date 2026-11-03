"use client";

import { useSearchParams } from "next/navigation";

import { PageTitle } from "@/components/desk/ui/PageTitle";
import { DataTable } from "@/components/admin/DataTable";
import { TableChips } from "@/components/admin/tables";
import { ADMIN_TABLES } from "@/lib/admin/tables";

/**
 * «Данные» on the desk: the company's tables as readable grids, the phone's `/admin` at full
 * width. Read-only, under the director's RLS — nothing here can see another company and nothing
 * here writes. `?table=` keeps the table in the address.
 */
export default function DeskDataPage() {
  const params = useSearchParams();
  const spec = ADMIN_TABLES.find((t) => t.table === params.get("table")) ?? ADMIN_TABLES[0];
  return (
    <div className="flex w-full flex-col">
      <PageTitle title="Данные" state={{ text: "таблицы компании как есть — только чтение" }} />
      <TableChips active={spec.table} onPick={(table) => window.history.replaceState(null, "", `?table=${table}`)} />
      <div className="mt-4">
        <DataTable key={spec.table} spec={spec} />
      </div>
    </div>
  );
}
