"use client";

import type { Column } from "@/components/desk/ui/DataGrid";
import type { MenuItem } from "@/components/desk/ui/Menu";
import { When } from "@/components/desk/ui/When";
import { Icon } from "@/components/tasks/desk/icons";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { humanAqtobe } from "@/lib/ai/time";
import { columnFits, deliveryLine, fitColumn, handInVerdict, latestLine, stageOf, underTitle, verdictRank, type Move } from "@/lib/desk/tasks";
import { shortName } from "@/lib/people/names";
import { hasUnread, type BoardTask } from "@/lib/pulse/board";
import { REASON_ORDER, type DeskReason } from "@/lib/tasks/desk";
import { closedAtOf } from "@/lib/tasks/overview";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import type { DeliveryRow } from "@/lib/tasks/receipts";
import { deadlineLabel, isOverdue, TEXT } from "@/lib/tasks/status-text";

import { FaceName } from "./Face";
import { DraftMark, MoreButton, MoveRow } from "./RowMoves";
import { DeliveryCell } from "./TaskParts";

const STAGE_ORDER = (task: TaskWithPeople, reason: DeskReason | null) => (reason ? REASON_ORDER.indexOf(reason) : 10 + ["sent", "accepted", "in_progress", "rework", "pending_review", "scheduled", "done", "revoked", "declined"].indexOf(task.status));

export type TaskColumnsInput = {
  /** the rows of the tab */
  shown: readonly TaskWithPeople[];
  /** «В архиве» under the working tabs: what the search found in history */
  archived: readonly TaskWithPeople[];
  archivedIds: ReadonlySet<string>;
  /** the director's own rows of the board */
  rows: ReadonlyMap<string, BoardTask>;
  reasons: ReadonlyMap<string, DeskReason>;
  receipts: Readonly<Record<string, DeliveryRow | undefined>> | undefined;
  now: Date;
  meId: string;
  /** the list's width bucket (`useWidthBucket`) */
  bucket: number;
  group: string;
  archiveTab: boolean;
  panelOpen: boolean;
  picked: ReadonlySet<string>;
  avatars: ReadonlyMap<string, string | null>;
  goneIds: ReadonlySet<string>;
  drafts: ReadonlySet<string>;
  /** the mark's checkbox: the row is marked (or not) and becomes the chosen one */
  onPick: (id: string) => void;
  movesOf: (task: TaskWithPeople) => Move[];
  onMove: (move: Move, task: TaskWithPeople, target?: HTMLElement) => void;
  /** the row's «⋯»: its menu, the row becoming the chosen one */
  menuOf: (task: TaskWithPeople) => MenuItem[];
};

/**
 * The columns of the table of «Задачи» (D-154 wave 3): 34 px rows, columns as wide as their words.
 * A column with nothing to say on this tab is not drawn — history has no receipts, no waiting
 * words — and the rest give way on a narrow list so that «Что» stays readable (COLUMN_FLOOR).
 * `tight` — the tool bar tightens with the table, so that the rows start higher.
 */
export function taskColumns({
  shown,
  archived,
  archivedIds,
  rows,
  reasons,
  receipts,
  now,
  meId,
  bucket,
  group,
  archiveTab,
  panelOpen,
  picked,
  avatars,
  goneIds,
  drafts,
  onPick,
  movesOf,
  onMove,
  menuOf,
}: TaskColumnsInput): { columns: Column<TaskWithPeople>[]; tight: boolean } {
  // grouped by the person, the group's head names them: the column would only repeat it
  const byPerson = group === "person";
  const closedRow = (task: TaskWithPeople) => task.status === "done" || task.status === "revoked" || archivedIds.has(task.id);
  const showDelivery = !panelOpen && columnFits("delivery", bucket) && shown.some((task) => task.status === "sent" || task.status === "scheduled");
  const showLast = !panelOpen && columnFits("last", bucket) && shown.some((task) => latestLine(task, rows.get(task.id), now) !== null);
  // grouped by the reason or the stage, the group's head already says it
  const showStage = group !== "reason" && columnFits("stage", bucket);
  const showWho = !byPerson && columnFits("who", bucket);
  const showDue = columnFits("due", bucket);
  // the verdict leaves with the tick: on the narrowest list «Закрыта» says the most
  // the archive's own column: the panel says the same, so it leaves as early as the stage does
  const showVerdict = columnFits("stage", bucket);
  const anyPicked = picked.size > 0;
  const verdictOf = (task: TaskWithPeople) => (task.status === "pending_review" ? handInVerdict(task) : null);
  const closedText = (task: TaskWithPeople) => humanAqtobe(new Date(closedAtOf(task)), now);
  // with «Последнее» gone, a handed-in row's deadline makes room for how it was handed in; under
  // the head «Срок» a row of «В архиве» says what its date is
  const dueText = (task: TaskWithPeople) =>
    (showLast ? null : verdictOf(task)?.text) ??
    (closedRow(task) ? `закрыта ${closedText(task)}` : !task.deadline && task.priority === "high" ? TEXT.urgent : deadlineLabel(task, now).text);
  // under the floor of «Последнее» the columns keep to lower ceilings: their sum never leaves «Что» under its minimum
  const snug = !columnFits("last", bucket);
  // the person's face stands before the name (D-171, D-174): the column keeps room for it
  const face = 30;
  const widths = {
    who: fitColumn(shown.map((task) => shortName(task.assignee?.full_name)), { min: 96 + face, max: (snug ? 120 : 160) + face, extra: 10 + face }),
    due: fitColumn([...shown, ...archived].map(dueText), { min: 116, max: archived.length > 0 ? 196 : snug ? 132 : 172, perChar: archived.length > 0 ? 8 : undefined }),
    closed: fitColumn(shown.map(closedText), { min: 116, max: snug ? 136 : 172 }),
    verdict: fitColumn(shown.map((task) => handInVerdict(task)?.text ?? ""), { min: 84, max: snug ? 148 : 180, perChar: 8 }),
    stage: fitColumn(shown.map((task) => stageOf(task, reasons.get(task.id) ?? null, now).text), { min: 88, max: snug ? 110 : 150, extra: 34 }),
    // never narrower than its own head («ДОСТАВКА» in capitals)
    delivery: fitColumn(
      shown.map((task) => (task.status === "sent" ? (deliveryLine(task, receipts?.[task.id] ?? null, now)?.text ?? "") : "—")),
      { min: 104, max: snug ? 150 : 200 },
    ),
  };
  const everyColumn: Column<TaskWithPeople>[] = [
    {
      key: "pick",
      title: (
        <span className="sr-only">Отметка</span>
      ),
      // the rows stand in a card that clips its margin, so the mark has a slot of its own
      width: "28px",
      render: (task) => {
        const on = picked.has(task.id);
        return (
          <>
            {/* a marked row is tinted whole — the cell reaches over the row (it is the positioned parent) */}
            {on ? <span aria-hidden className="tasks-picked pointer-events-none absolute inset-0 bg-accent/[0.07]" /> : null}
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={on ? "Снять отметку" : "Отметить"}
              title={`${on ? "Снять отметку" : "Отметить"} · X`}
              data-testid="desk-row-pick"
              data-on={on ? "" : undefined}
              onClick={(event) => {
                event.stopPropagation();
                onPick(task.id);
              }}
              className={`tasks-pick relative flex h-4 w-4 items-center justify-center rounded-[2px] border transition-opacity duration-[120ms] after:absolute after:-inset-2 ${on ? "border-accent bg-accent text-bg opacity-100" : `border-muted/60 ${anyPicked ? "opacity-100" : "opacity-0 [.desk-row:hover_&]:opacity-100 focus-visible:opacity-100"}`}`}
            >
              {on ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              ) : null}
            </button>
          </>
        );
      },
    },
    ...(byPerson
      ? []
      : ([
          {
            key: "who",
            title: "Кто",
            width: widths.who,
            sort: (a, b) => (a.assignee?.full_name ?? "").localeCompare(b.assignee?.full_name ?? "", "ru"),
            render: (task) => (
              <span className="block" data-act-for={task.id} data-act="reassign handoff reissue">
                <FaceName
                  id={task.assignee_id}
                  name={task.assignee?.full_name}
                  avatar={avatars.get(task.assignee_id)}
                  muted={closedRow(task)}
                  gone={!closedRow(task) && goneIds.has(task.assignee_id)}
                />
              </span>
            ),
          },
        ] satisfies Column<TaskWithPeople>[])),
    {
      key: "what",
      title: "Что",
      width: columnFits("pick", bucket) ? "minmax(160px,1fr)" : "minmax(120px,1fr)",
      sort: (a, b) => a.title.localeCompare(b.title, "ru"),
      render: (task) => {
        const row = rows.get(task.id);
        const under = underTitle(task, row, meId, now);
        const unread = row ? hasUnread(row, meId) : false;
        return (
          // one line: the title, then the thread's newest word in grey — a row stays 34 px
          <span className="tasks-what flex min-w-0 items-center gap-2.5">
            <span className="shrink-0" data-testid="desk-glyph" data-status={task.status} title={stageOf(task, reasons.get(task.id) ?? null, now).text}>
              <StatusGlyph status={task.status} overdue={isOverdue(task, now)} size={16} />
            </span>
            <span className="flex min-w-0 items-baseline gap-2" title={under ? `${task.title}\n${under}` : task.title}>
              <span className={`min-w-0 shrink truncate font-medium ${closedRow(task) ? "text-text/70" : ""}`}>{task.title}</span>
              {under ? <span className="tasks-under min-w-0 max-w-[45%] shrink-[2] truncate text-[13px] text-muted">{under}</span> : null}
            </span>
            {task.recurrence_rule_id ? (
              <span className="shrink-0 text-muted" title="Повторяется">
                <Icon name="repeat" size={13} />
              </span>
            ) : null}
            {drafts.has(task.id) && task.status !== "revoked" ? <DraftMark /> : null}
            {unread ? (
              <span aria-label="новое сообщение" title="Новое сообщение" className="tasks-unread shrink-0 text-[12px] leading-4 text-accent">
                новое
              </span>
            ) : null}
          </span>
        );
      },
    },
    ...(archiveTab
      ? ([
          {
            key: "closed",
            title: "Закрыта",
            width: widths.closed,
            sort: (a, b) => closedAtOf(a).localeCompare(closedAtOf(b)),
            render: (task) => (
              <span className="block truncate whitespace-nowrap text-[13px] text-muted" data-testid="desk-row-closed">
                <When>{closedText(task)}</When>
              </span>
            ),
          },
          ...(showVerdict
            ? ([
                {
                  key: "verdict",
                  title: "В срок",
                  width: widths.verdict,
                  sort: (a, b) => verdictRank(handInVerdict(a)) - verdictRank(handInVerdict(b)),
                  render: (task) => {
                    const verdict = handInVerdict(task);
                    if (!verdict) return <span className="text-muted/60">—</span>;
                    return (
                      <span
                        className="block truncate whitespace-nowrap text-[13px]"
                        title={`Сдано ${humanAqtobe(new Date(task.completed_at as string), now)} · срок ${humanAqtobe(new Date(task.deadline as string), now)}`}
                        data-testid="desk-row-verdict"
                      >
                        <When overdue={verdict.late}>{verdict.text}</When>
                      </span>
                    );
                  },
                },
              ] satisfies Column<TaskWithPeople>[])
            : []),
        ] satisfies Column<TaskWithPeople>[])
      : []),
    {
      key: "due",
      title: "Срок",
      width: widths.due,
      sort: (a, b) => (a.deadline ?? "9").localeCompare(b.deadline ?? "9"),
      render: (task) => {
        const verdict = verdictOf(task);
        if (verdict) {
          // a hand-in after the deadline is this row's missed deadline: the one colour it may carry (D-158)
          return (
            <span className="block truncate whitespace-nowrap text-[13px]" title={`Сдано ${verdict.text} · срок ${deadlineLabel(task, now).text}`} data-testid="desk-row-handin">
              <When overdue={verdict.late}>{dueText(task)}</When>
            </span>
          );
        }
        // a row of «В архиве» says when it closed; a refusal keeps its deadline — the director still decides it
        if (closedRow(task)) {
          return (
            <span className="block truncate whitespace-nowrap text-[13px] text-muted">
              <When>{dueText(task)}</When>
            </span>
          );
        }
        if (!task.deadline && task.priority === "high") return <span className="text-[13px] font-medium" data-act-for={task.id} data-act="extend retime">{TEXT.urgent}</span>;
        const label = deadlineLabel(task, now);
        return (
          <span className={`block truncate whitespace-nowrap text-[13px] ${label.none ? "text-muted" : ""}`} data-act-for={task.id} data-act="extend retime">
            <When overdue={label.overdue}>{label.text}</When>
          </span>
        );
      },
    },
    {
      key: "stage",
      title: "Стадия",
      width: widths.stage,
      sort: (a, b) => STAGE_ORDER(a, reasons.get(a.id) ?? null) - STAGE_ORDER(b, reasons.get(b.id) ?? null),
      // the stage in words, neutral: the ring at the title already says it (D-158)
      render: (task) => (
        <span className="block truncate text-[13px] text-text/80" data-testid="desk-stage">
          {stageOf(task, reasons.get(task.id) ?? null, now).text}
        </span>
      ),
    },
    ...(showDelivery
      ? ([{ key: "delivery", title: "Доставка", width: widths.delivery, render: (task) => <DeliveryCell task={task} receipt={receipts?.[task.id]} now={now} /> }] satisfies Column<TaskWithPeople>[])
      : []),
    ...(!showLast
      ? []
      : ([
          {
            key: "last",
            title: "Последнее",
            width: "minmax(0,0.8fr)",
            render: (task) => {
              const line = latestLine(task, rows.get(task.id), now);
              return line ? (
                <span className="block truncate text-[13px] text-text/80" title={line.text}>
                  {line.text}
                </span>
              ) : (
                <span className="text-muted/60">—</span>
              );
            },
          },
        ] satisfies Column<TaskWithPeople>[])),
    {
      key: "more",
      title: "",
      width: "44px",
      align: "right",
      render: (task) => {
        const moves = movesOf(task);
        return (
          <span className="flex justify-end">
            {moves.length > 0 ? (
              // the row's two moves under the hand: over the row's right end while it is hovered or
              // chosen (with the panel open the panel holds the chosen row's moves)
              <span
                className={`desk-row-moves pointer-events-none absolute inset-y-0 right-8 hidden items-center pl-3 [.desk-row:hover_&]:pointer-events-auto [.desk-row:hover_&]:flex ${
                  panelOpen ? "" : "[.desk-row[aria-selected=true]_&]:pointer-events-auto [.desk-row[aria-selected=true]_&]:flex"
                }`}
              >
                <MoveRow className="flex-row-reverse" moves={moves} onPress={(move, target) => onMove(move, task, target)} />
              </span>
            ) : null}
            <MoreButton taskId={task.id} items={() => menuOf(task)} />
          </span>
        );
      },
    },
  ];

  const tight = !columnFits("delivery", bucket);
  const givenWay = new Set([!showWho && "who", (!showDue || archiveTab) && "due", !showDue && "closed", !showStage && "stage"]);
  return { columns: everyColumn.filter((column) => !givenWay.has(column.key)), tight };
}
