"use client";

import { Plus, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import { TileFace } from "@/components/desk/team/TeamGrid";
import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { useContextMenu } from "@/components/desk/ui/Menu";
import { Num } from "@/components/desk/ui/Num";
import { PointsSheet } from "@/components/rating/PointsSheet";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { pointsTone } from "@/lib/desk/format";
import { shortName, useNamesKey } from "@/lib/people/names";
import { ROLE_LABEL, usePeople, type Person } from "@/lib/people/queries";
import { useRating, useTeamBalances, type RatingPeriod, type RatingRow } from "@/lib/points/queries";

export const PERIOD_LABEL: Record<RatingPeriod, string> = { week: "Неделя", month: "Месяц", all: "Всё время" };

const PERIOD_COLUMN: Record<RatingPeriod, string> = { week: "За неделю", month: "За месяц", all: "За всё время" };

/** The change against the period before — none for «всё время», which has no period before it. */
const DELTA_COLUMN: Record<RatingPeriod, string | null> = { week: "Динамика", month: "Динамика", all: null };

type Line = { row: RatingRow; person: Person | undefined; sub: string | null; balance: number | null };

const byName = (a: Line, b: Line) => a.row.display_name.localeCompare(b.row.display_name, "ru");
const nums = (value: number | null) => value ?? Number.NEGATIVE_INFINITY;

/** Points of a period, or their change: a gain in print, a loss and nothing quiet, with a real «−» (D-154). */
function Points({ value, bold = false }: { value: number; bold?: boolean }) {
  return <Num value={value} signed tone={pointsTone(value)} className={bold ? "font-semibold" : ""} />;
}

/** A person of the table: their circle, the name, the position under it. */
function Who({ line }: { line: Line }) {
  // re-reads the company's names, so «Ерлан» becomes «Ерлан Б.» once the roster has come
  useNamesKey();
  const person = line.person ?? { id: line.row.user_id, full_name: line.row.display_name, avatar_url: null };
  return (
    <span className="flex min-w-0 items-center gap-3">
      <TileFace person={person} size={32} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] font-medium leading-5" title={line.row.display_name}>
          {shortName(line.row.display_name)}
        </span>
        {line.sub ? <span className="truncate text-[12px] leading-4 text-muted">{line.sub}</span> : null}
      </span>
    </span>
  );
}

/** What a person holds: the figure, and a bar of it against the richest of the team that grows in from the left. */
function Balance({ value, max, at }: { value: number | null; max: number; at: number }) {
  if (value === null) return <span className="text-muted">—</span>;
  const share = value > 0 && max > 0 ? Math.max(0.02, value / max) : 0;
  return (
    <span className="pts-balance">
      <span className="pts-balance-track" aria-hidden>
        <span className="pts-balance-bar" style={{ "--share": share, animationDelay: `${Math.min(at, 12) * 35}ms` } as CSSProperties} />
      </span>
      {/* a balance is what a person holds, not news: plain figures, a debt quiet with its «−» */}
      <Num value={value} tone={value < 0 ? "muted" : null} className="pts-balance-figure font-semibold" />
    </span>
  );
}

/** The share of tasks closed in time as a small ring that closes itself, the percent beside it. */
function OnTime({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted/60">—</span>;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="pts-ring">
        <circle cx="8" cy="8" r="6" pathLength={100} className="pts-ring-track" />
        <circle cx="8" cy="8" r="6" pathLength={100} className="pts-ring-arc" data-full={pct >= 100 ? "" : undefined} style={{ "--pct": pct } as CSSProperties} />
      </svg>
      <span className="nums">{pct}%</span>
    </span>
  );
}

/** The change against the period before: an arrow up in gold, down quiet — never an alarm. */
function Delta({ value }: { value: number }) {
  if (value === 0) return <Num value={0} />;
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {value > 0 ? <TrendingUp size={13} strokeWidth={2.25} aria-hidden style={{ color: "var(--gold)" }} /> : <TrendingDown size={13} strokeWidth={2.25} aria-hidden className="text-muted" />}
      <Points value={value} />
    </span>
  );
}

/** The table's place while the team loads: rows of the real height, faces and bars where they will be. */
function BalancesBone() {
  return (
    <SkeletonGroup grow className="pts-bone desk-grid">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-2.5">
          <Bone round w={32} h={32} />
          <Bone h={14} w={140} />
          <Bone h={6} w={160} className="ml-auto" />
          <Bone h={14} w={60} />
          <Bone h={14} w={260} />
        </div>
      ))}
    </SkeletonGroup>
  );
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
        person,
        sub: person ? person.position || ROLE_LABEL[person.role] : null,
        balance: balances.data ? (balances.data[row.user_id] ?? 0) : null,
      };
    });
    // the richest first, as the shop's «кто копит»
    return rows.sort((a, b) => nums(b.balance) - nums(a.balance) || byName(a, b));
  }, [rating.data, balances.data, people.data]);

  const max = Math.max(0, ...lines.map((line) => line.balance ?? 0));
  const order = new Map(lines.map((line, index) => [line.row.user_id, index]));

  const columns: Column<Line>[] = [
    { key: "person", title: "Человек", width: "minmax(190px,1.3fr)", sort: byName, render: (line) => <Who line={line} /> },
    {
      key: "balance",
      title: "Баланс",
      width: "minmax(170px,1fr)",
      align: "right",
      sort: (a, b) => nums(a.balance) - nums(b.balance),
      render: (line) => <Balance value={line.balance} max={max} at={order.get(line.row.user_id) ?? 0} />,
    },
    {
      key: "period",
      title: PERIOD_COLUMN[period],
      width: "108px",
      align: "right",
      sort: (a, b) => a.row.points - b.row.points,
      render: (line) => <Points value={line.row.points} />,
    },
    {
      key: "rank",
      title: "Место",
      width: "72px",
      align: "right",
      sort: (a, b) => a.row.rank - b.row.rank,
      // the first three of the period that earned anything carry the reward's gold
      render: (line) => (
        <span className="pts-rank nums" data-top={line.row.rank <= 3 && line.row.points > 0 ? line.row.rank : undefined}>
          {line.row.rank}
        </span>
      ),
    },
    ...(DELTA_COLUMN[period]
      ? [
          {
            key: "delta",
            title: DELTA_COLUMN[period],
            width: "104px",
            align: "right",
            sort: (a, b) => a.row.delta_vs_prev - b.row.delta_vs_prev,
            render: (line) => <Delta value={line.row.delta_vs_prev} />,
          } satisfies Column<Line>,
        ]
      : []),
    {
      key: "on_time",
      title: "В срок",
      width: "88px",
      align: "right",
      sort: (a, b) => (a.row.on_time_pct ?? -1) - (b.row.on_time_pct ?? -1),
      render: (line) => <OnTime pct={line.row.on_time_pct} />,
    },
    {
      key: "award",
      title: "",
      width: "116px",
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
          icon={<Plus size={14} strokeWidth={2.25} />}
          className="pts-row-award !min-h-7 !px-2 opacity-0 focus-visible:opacity-100 [.desk-row:hover_&]:opacity-100 [.desk-row[aria-selected=true]_&]:opacity-100"
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
        className="pts-balances"
        columns={columns}
        rows={lines}
        rowKey={(line) => line.row.user_id}
        selectedKey={selected}
        onSelect={(line) => onSelect(line.row.user_id)}
        onActivate={(line) => setOpened(line.row)}
        empty={
          loading ? (
            <BalancesBone />
          ) : rating.isError ? (
            <EmptyState
              title="Не получилось загрузить рейтинг"
              hint="Проверьте связь и попробуйте ещё раз"
              action={
                <Button size="sm" variant="secondary" onClick={() => void rating.refetch()}>
                  Повторить
                </Button>
              }
            />
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
