"use client";

import { useMemo, useState } from "react";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { PersonCell } from "@/components/desk/ui/PersonCell";
import { PointsSheet } from "@/components/rating/PointsSheet";
import { Button } from "@/components/ui/Button";
import { ROLE_LABEL, usePeople } from "@/lib/people/queries";
import { useRating, useTeamBalances, type RatingPeriod, type RatingRow } from "@/lib/points/queries";

export const PERIOD_LABEL: Record<RatingPeriod, string> = { week: "Неделя", month: "Месяц", all: "Всё время" };

const PERIOD_COLUMN: Record<RatingPeriod, string> = { week: "За неделю", month: "За месяц", all: "За всё время" };

type Line = { row: RatingRow; sub: string | null; balance: number | null };

const byName = (a: Line, b: Line) => a.row.display_name.localeCompare(b.row.display_name, "ru");
const nums = (value: number | null) => value ?? Number.NEGATIVE_INFINITY;

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted">—</span>;
  const up = value > 0;
  return (
    <span className="nums" style={{ color: up ? "var(--ok)" : "var(--danger)" }}>
      {up ? "↑" : "↓"}
      {Math.abs(value)}
    </span>
  );
}

/**
 * The team's points as a table (D-48, D-153): everyone the rating counts — the company but the
 * director and the wall — with the balance (the sum of their ledger, summed by the database,
 * principle 4), the points of the period, the place, the share of tasks closed in time.
 * «Начислить» on a row; Enter or a double click opens the person's lines (`PointsSheet`).
 */
export function BalancesTable({ period, canAward, onAward }: { period: RatingPeriod; canAward: boolean; onAward: (userId: string) => void }) {
  const rating = useRating(period);
  const balances = useTeamBalances(true);
  const people = usePeople();
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState<RatingRow | null>(null);

  const lines = useMemo<Line[]>(() => {
    const byId = new Map((people.data ?? []).map((person) => [person.id, person]));
    const rows = (rating.data ?? []).map((row) => {
      const person = byId.get(row.user_id);
      return {
        row,
        sub: person ? person.position || ROLE_LABEL[person.role] : null,
        balance: balances.data ? (balances.data[row.user_id] ?? 0) : null,
      };
    });
    // the richest first, as the shop's «кто копит»
    return rows.sort((a, b) => nums(b.balance) - nums(a.balance) || byName(a, b));
  }, [rating.data, balances.data, people.data]);

  const columns: Column<Line>[] = [
    { key: "person", title: "Человек", sort: byName, render: (line) => <PersonCell name={line.row.display_name} sub={line.sub} /> },
    {
      key: "balance",
      title: "Баланс",
      width: "120px",
      align: "right",
      sort: (a, b) => nums(a.balance) - nums(b.balance),
      render: (line) => <span className="nums font-semibold">{line.balance ?? "—"}</span>,
    },
    {
      key: "period",
      title: PERIOD_COLUMN[period],
      width: "140px",
      align: "right",
      sort: (a, b) => a.row.points - b.row.points,
      render: (line) => <span className="nums">{line.row.points}</span>,
    },
    { key: "rank", title: "Место", width: "88px", align: "right", sort: (a, b) => a.row.rank - b.row.rank, render: (line) => <span className="nums">{line.row.rank}</span> },
    {
      key: "delta",
      title: "Динамика",
      width: "120px",
      align: "right",
      sort: (a, b) => a.row.delta_vs_prev - b.row.delta_vs_prev,
      render: (line) => <Delta value={line.row.delta_vs_prev} />,
    },
    {
      key: "on_time",
      title: "В срок",
      width: "96px",
      align: "right",
      sort: (a, b) => (a.row.on_time_pct ?? -1) - (b.row.on_time_pct ?? -1),
      render: (line) => (line.row.on_time_pct !== null ? <span className="nums">{line.row.on_time_pct}%</span> : <span className="text-muted">—</span>),
    },
    {
      key: "award",
      title: "",
      width: "128px",
      align: "right",
      render: (line) => (
        <Button size="sm" variant="secondary" disabled={!canAward} onClick={() => onAward(line.row.user_id)} data-testid="points-award-row">
          Начислить
        </Button>
      ),
    },
  ];

  const loading = rating.isPending || people.isPending;

  return (
    <>
      <DataGrid
        aria-label="Балансы команды"
        columns={columns}
        rows={lines}
        rowKey={(line) => line.row.user_id}
        selectedKey={selected}
        onSelect={(line) => setSelected(line.row.user_id)}
        onActivate={(line) => setOpened(line.row)}
        empty={
          loading ? (
            <EmptyState title="Загружаю команду" />
          ) : rating.isError ? (
            <EmptyState title="Не получилось загрузить рейтинг" hint="Проверьте связь и откройте экран ещё раз" />
          ) : (
            <EmptyState title="В команде пока никого" hint="Очки получают сотрудники — добавьте их в разделе «Команда»" />
          )
        }
      />
      <PointsSheet
        row={opened}
        canRead
        canAward={canAward}
        onClose={() => setOpened(null)}
        onAward={(row) => {
          setOpened(null);
          onAward(row.user_id);
        }}
      />
    </>
  );
}
