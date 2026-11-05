"use client";

import { useMemo, useState } from "react";

import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { useContextMenu } from "@/components/desk/ui/Menu";
import { Num } from "@/components/desk/ui/Num";
import { PersonLine } from "@/components/desk/settings/form";
import { PointsSheet } from "@/components/rating/PointsSheet";
import { Button } from "@/components/ui/Button";
import { pointsTone } from "@/lib/desk/format";
import { ROLE_LABEL, usePeople } from "@/lib/people/queries";
import { useRating, useTeamBalances, type RatingPeriod, type RatingRow } from "@/lib/points/queries";

export const PERIOD_LABEL: Record<RatingPeriod, string> = { week: "Неделя", month: "Месяц", all: "Всё время" };

const PERIOD_COLUMN: Record<RatingPeriod, string> = { week: "За неделю", month: "За месяц", all: "За всё время" };

/** The change against the period before — none for «всё время», which has no period before it. */
const DELTA_COLUMN: Record<RatingPeriod, string | null> = { week: "Динамика", month: "Динамика", all: null };

type Line = { row: RatingRow; sub: string | null; balance: number | null };

const byName = (a: Line, b: Line) => a.row.display_name.localeCompare(b.row.display_name, "ru");
const nums = (value: number | null) => value ?? Number.NEGATIVE_INFINITY;

/** Points of a period, or their change: a gain in print, a loss and nothing quiet, with a real «−» (D-154). */
function Points({ value, bold = false }: { value: number; bold?: boolean }) {
  return <Num value={value} signed tone={pointsTone(value)} className={bold ? "font-semibold" : ""} />;
}

/**
 * The team's points as a table (D-48, D-153): everyone the rating counts — the company but the
 * director and the wall — with the balance (the sum of their ledger, summed by the database,
 * principle 4), the points of the period, the place, the share of tasks closed in time.
 * «Начислить» on a row; Enter or a double click opens the person's lines (`PointsSheet`).
 */
export function BalancesTable({
  period,
  canAward,
  selected,
  onSelect,
  onAward,
  onHistory,
}: {
  period: RatingPeriod;
  canAward: boolean;
  /** The chosen person: the screen's N gives to them. */
  selected: string | null;
  onSelect: (userId: string) => void;
  onAward: (userId: string) => void;
  /** «История» narrowed to the person. */
  onHistory: (userId: string) => void;
}) {
  const rating = useRating(period);
  const balances = useTeamBalances(true);
  const people = usePeople();
  const menu = useContextMenu();
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
    { key: "person", title: "Человек", sort: byName, render: (line) => <PersonLine name={line.row.display_name} sub={line.sub} /> },
    {
      key: "balance",
      title: "Баланс",
      width: "104px",
      align: "right",
      sort: (a, b) => nums(a.balance) - nums(b.balance),
      // a balance is what a person holds, not news: plain figures, a debt quiet with its «−»
      render: (line) => (line.balance === null ? <span className="text-muted">—</span> : <Num value={line.balance} tone={line.balance < 0 ? "muted" : null} className="font-semibold" />),
    },
    {
      key: "period",
      title: PERIOD_COLUMN[period],
      width: "112px",
      align: "right",
      sort: (a, b) => a.row.points - b.row.points,
      render: (line) => <Points value={line.row.points} />,
    },
    { key: "rank", title: "Место", width: "72px", align: "right", sort: (a, b) => a.row.rank - b.row.rank, render: (line) => <span className="nums text-muted">{line.row.rank}</span> },
    ...(DELTA_COLUMN[period]
      ? [
          {
            key: "delta",
            title: DELTA_COLUMN[period],
            width: "100px",
            align: "right",
            sort: (a, b) => a.row.delta_vs_prev - b.row.delta_vs_prev,
            render: (line) => <Points value={line.row.delta_vs_prev} />,
          } satisfies Column<Line>,
        ]
      : []),
    {
      key: "on_time",
      title: "В срок",
      width: "84px",
      align: "right",
      sort: (a, b) => (a.row.on_time_pct ?? -1) - (b.row.on_time_pct ?? -1),
      render: (line) => (line.row.on_time_pct !== null ? <span className="nums">{line.row.on_time_pct}%</span> : <span className="text-muted/60">—</span>),
    },
    {
      key: "award",
      title: "",
      width: "100px",
      align: "right",
      render: (line) => (
        // the row's own «Начислить» shows under the mouse and on the chosen row only — not a column of the same word
        <Button
          size="sm"
          variant="ghost"
          disabled={!canAward}
          onClick={() => onAward(line.row.user_id)}
          data-testid="points-award-row"
          title="Начислить · N"
          className="!min-h-6 !px-2 opacity-0 hover:bg-surface-2 focus-visible:opacity-100 [.desk-row:hover_&]:opacity-100 [.desk-row[aria-selected=true]_&]:opacity-100"
        >
          Начислить
        </Button>
      ),
    },
  ];

  const loading = rating.isPending || people.isPending;

  return (
    <>
      <div
        onContextMenu={(event) => {
          const row = (event.target as Element).closest<HTMLElement>("[data-row-key]");
          const line = row ? lines.find((item) => item.row.user_id === row.dataset.rowKey) : undefined;
          if (!line) return;
          onSelect(line.row.user_id);
          menu.open(event, [
            { key: "award", label: "Начислить…", hint: "N", disabled: !canAward, onSelect: () => onAward(line.row.user_id) },
            { key: "lines", label: "Строки очков", hint: "Enter", onSelect: () => setOpened(line.row) },
            { key: "history", label: "История человека", onSelect: () => onHistory(line.row.user_id) },
          ]);
        }}
      >
      <DataGrid
        aria-label="Балансы команды"
        columns={columns}
        rows={lines}
        rowKey={(line) => line.row.user_id}
        selectedKey={selected}
        onSelect={(line) => onSelect(line.row.user_id)}
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
      </div>
      {menu.node}
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
