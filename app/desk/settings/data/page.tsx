"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { DataDesk } from "@/components/desk/settings/data/DataDesk";

/**
 * «Данные» on the desk: the company's tables as a sheet at the window's width. Read-only, under the
 * director's RLS — nothing here can see another company and nothing here writes. `?table=` keeps
 * the table in the address.
 */
export default function DeskDataPage() {
  const params = useSearchParams();
  const [table] = useState(() => params.get("table"));
  return <DataDesk initialTable={table} />;
}
