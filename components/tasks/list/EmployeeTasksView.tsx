"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/tasks/desk/icons";
import { Button } from "@/components/ui/Button";
import { PageHead } from "@/components/ui/PageHead";
import { ASK_FROM_DEFAULT } from "@/lib/daily-report/due";
import { useReportDue } from "@/lib/daily-report/queries";
import { nowHm } from "@/lib/datetime/calendar";
import { useReactionPrices, useTaskReactions } from "@/lib/points/game";
import { usePointsEnabled } from "@/lib/points/queries";
import type { BoardTask } from "@/lib/pulse/board";
import { compareTasks } from "@/lib/tasks/grouping";
import type { TaskActions } from "@/lib/tasks/mutations";
import { closedSections, employeeScreen, employeeTabOf, workingSections, type EmployeeTab, type Section } from "@/lib/tasks/overview";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, TEXT } from "@/lib/tasks/status-text";

import { EmployeeTaskCard, type EmployeeAction } from "./EmployeeTaskCard";
import { StatusScreen } from "./StatusScreen";
import { TabColumnBox, Tabs } from "./Tabs";
import { TaskColumn, useAccordion, useRevealOpen } from "./TaskList";
import { useEmployeeControls } from "./useEmployeeControls";

const DATE_LINE = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });

const LATE_MARK = "есть просроченные";

/**
 * How long after a move the card buttons ignore taps (D-173). The next card opens ~0.3 s after
 * «Принял» with its own first button where the finger was: a newcomer's second tap (nothing seemed
 * to happen) must not open «Что сделано?» for another order. No deliberate next move comes this fast.
 */
const TAP_GUARD_MS = 900;

/**
 * «Мои дела» (D-83): the same screen shape as the director's «Задачи» — a status screen
 * (what to accept, what is late, how much is in hand), three tabs «Новые / В работе /
 * Закрытые», cards that open in place. A new task opens by itself with Принял / Уточнить /
 * Не могу (принцип 2), so accepting stays one tap from the tab bar; the next new one takes
 * its place.
 *
 * D-173 — the order is found and taken at first sight: while orders wait for the person's move
 * the status screen is one line, so the first card's «Принял» is in sight; a return for rework
 * sits with the new ones («Новые»: what the person looks for first, and the card says it was
 * returned); with nothing new the screen opens on «В работе» with its most urgent card open; a
 * late order puts a red dot on its tab's count. Taking the last new one, the screen follows it
 * into «В работе»; a tap that comes right after a move does nothing, so a double tap never acts on
 * the card that has just opened under the finger. «Отчёт за день» stands under the list in the day
 * and above the tabs from `ask_from` — the same place as in Лента's «Дела».
 */
export function EmployeeTasksView({
  meId,
  companyId,
  tasks: all,
  board,
  actions,
  now,
  report,
}: {
  meId: string;
  companyId: string;
  /** The employee's own tasks, every status (`useMyTasks`). */
  tasks: readonly TaskWithPeople[];
  /** Their own board rows (`usePulseBoard`): the director's last word and the read cursor. */
  board: readonly BoardTask[];
  actions: TaskActions;
  now: Date;
  /** The «Отчёт за день» row (D-152): under the list in the day, above the tabs in the evening (D-173); the sandbox draws none. */
  report?: ReactNode;
}) {
  // the director's reactions (D-133): a gold outline and a badge on the card
  const reactions = useTaskReactions();
  const prices = useReactionPrices();
  const pointsEnabled = usePointsEnabled().data === true;

  const rows = useMemo(() => new Map(board.map((row) => [row.id, row] as [string, BoardTask])), [board]);
  const screen = useMemo(() => employeeScreen(all, now), [all, now]);

  const piles = useMemo(() => {
    const byTab: Record<EmployeeTab, TaskWithPeople[]> = { new: [], working: [], closed: [] };
    for (const task of all) byTab[employeeTabOf(task)].push(task);
    return byTab;
  }, [all]);

  // a late order puts a red dot on its tab's count (D-173)
  const lateIn = useMemo(
    () => ({ new: piles.new.some((task) => isOverdue(task, now)), working: piles.working.some((task) => isOverdue(task, now)) }),
    [piles, now],
  );

  // the first look opens on what waits for «Принял»; after that the tab is theirs
  const [tab, setTab] = useState<EmployeeTab>(() => (piles.new.length > 0 ? "new" : "working"));
  // until the person picks a tab, «В работе» opens its most urgent card by itself (D-173)
  const [firstLook, setFirstLook] = useState(true);
  const current = tab;
  const choose = (next: EmployeeTab) => {
    setFirstLook(false);
    setTab(next);
  };

  const sections: Section<TaskWithPeople>[] = useMemo(() => {
    if (current === "new") return piles.new.length ? [{ key: "new", title: "", tone: "accent", tasks: [...piles.new].sort(compareTasks) }] : [];
    if (current === "working") return workingSections(piles.working, now);
    return closedSections(piles.closed, now);
  }, [current, piles, now]);

  const ids = useMemo(() => sections.flatMap((section) => section.tasks.map((task) => task.id)), [sections]);
  // «В работе» leads with the late, then the nearest; handed-in work at its foot is not the person's move
  const first = sections[0]?.tasks[0];
  const urgentFirst = firstLook && current === "working" && first !== undefined && first.status !== "pending_review";
  const accordion = useAccordion(ids, { scope: current, autoOpen: current === "new" || urgentFirst });
  useRevealOpen(accordion.openId, accordion.userTouched);

  const byId = (id: string) => all.find((task) => task.id === id) ?? null;

  const { press, sheets } = useEmployeeControls({ actions, companyId, tasks: all });

  // D-173: a second tap right after a move is the same tap again, not a move on the card that has
  // just opened under the finger — the buttons ignore it for a moment (no visual change)
  const lastMove = useRef(Number.NEGATIVE_INFINITY);
  // the order just taken with «Принял»: when it was the last new one, the screen follows it
  const [taken, setTaken] = useState<string | null>(null);
  const move = (action: EmployeeAction, task: TaskWithPeople) => {
    const at = performance.now();
    if (at - lastMove.current < TAP_GUARD_MS) return;
    lastMove.current = at;
    if (action === "accept") setTaken(task.id);
    press(action, task);
  };
  if (taken !== null && !piles.new.some((task) => task.id === taken)) {
    // it left «Новые»: with others still new, the next one opens there as before; with none left,
    // «Новых поручений нет» would hide the order the person just took — «В работе» opens on it
    setTaken(null);
    if (current === "new" && piles.new.length === 0 && piles.working.some((task) => task.id === taken)) {
      setFirstLook(false);
      setTab("working");
      accordion.focus(taken);
    }
  }

  const showNearest = (id: string) => {
    const task = byId(id);
    if (!task) return;
    choose(employeeTabOf(task));
    accordion.focus(id);
  };


  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24">
      <PageHead eyebrow={DATE_LINE.format(now)} title="Мои дела" tone={screen.tone} />

      <div className="mt-3">
        <StatusScreen screen={screen} now={now} onNearest={showNearest} />
      </div>
      {report ? (
        <ReportPlace now={now} evening>
          {report}
        </ReportPlace>
      ) : null}

      <Tabs
        className="mt-2"
        id="mine"
        value={current}
        onChange={choose}
        // the numbers stay what they count; a late order inside is a red dot on the corner (D-173) —
        // a red «5» beside «3 ждут вас» read as five late
        items={[
          { key: "new", label: "Новые", count: piles.new.length, alert: "accent", mark: lateIn.new ? "danger" : undefined, markLabel: LATE_MARK },
          { key: "working", label: "В работе", count: piles.working.length, mark: lateIn.working ? "danger" : undefined, markLabel: LATE_MARK },
          { key: "closed", label: "Закрытые", count: piles.closed.length },
        ]}
      />

      <TabColumnBox columnKey={current}>
        <TaskColumn
          sections={sections}
          empty={<EmptyState tab={current} nothingAtAll={all.length === 0} working={piles.working.length} onWorking={() => choose("working")} />}
          renderCard={(task) => (
            <EmployeeTaskCard
              task={task}
              row={rows.get(task.id)}
              meId={meId}
              open={accordion.openId === task.id}
              now={now}
              onToggle={() => accordion.toggle(task.id)}
              onAction={move}
              reaction={reactions.data?.[task.id] ?? null}
              reactionPoints={pointsEnabled && reactions.data?.[task.id] ? prices[reactions.data[task.id]] : null}
            />
          )}
        />
      </TabColumnBox>

      {report ? (
        <ReportPlace now={now} evening={false}>
          <div className="mt-4">{report}</div>
        </ReportPlace>
      ) : null}

      {sheets}
    </main>
  );
}

/**
 * Where «Отчёт за день» stands (D-173): under the list in the day — the orders come first — and
 * above the tabs once the evening has come (`ask_from`, the same hour as Лента's «Дела», D-167).
 * The place follows the hour, not the hand-in: «Сдать» does not move the row from under the
 * finger. Until today's report is read, the clock and the default hour decide.
 */
function ReportPlace({ now, evening, children }: { now: Date; evening: boolean; children: ReactNode }) {
  const due = useReportDue(now);
  const isEvening = due.show ? due.evening : nowHm(now) >= ASK_FROM_DEFAULT;
  return isEvening === evening ? <>{children}</> : null;
}

function EmptyState({
  tab,
  nothingAtAll,
  working,
  onWorking,
}: {
  tab: EmployeeTab;
  nothingAtAll: boolean;
  working: number;
  onWorking: () => void;
}) {
  if (nothingAtAll) {
    return (
      <div className="flex flex-col items-center rounded-[20px] border border-border/70 px-6 py-10 text-center">
        <Mascot state="calm" size={64} />
        <p className="mt-4 text-[16px] leading-[22px]">{TEXT.emptyFeed}</p>
      </div>
    );
  }
  if (tab === "new") {
    return (
      <div className="flex flex-col items-center rounded-[20px] border border-border/70 px-6 py-9 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ok/15 text-ok">
          <Icon name="check" size={24} />
        </span>
        <p className="mt-3 font-display text-[17px] font-semibold">Новых поручений нет</p>
        <p className="mt-1 text-[14px] leading-[19px] text-muted">Появится задача — покажу здесь и пришлю уведомление</p>
        {working > 0 ? (
          <Button variant="secondary" size="sm" className="mt-4" onClick={onWorking}>
            Что в работе · {working}
          </Button>
        ) : null}
      </div>
    );
  }
  // the status screen above says «Открытых дел нет» already: the empty tab says what lives in it
  return (
    <p className="rounded-[20px] border border-border/70 px-6 py-8 text-center text-[15px] text-muted">
      {tab === "working" ? "Здесь будет то, что вы приняли в работу" : "Закрытых пока нет"}
    </p>
  );
}
