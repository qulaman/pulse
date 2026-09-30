"use client";

import { useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/tasks/desk/icons";
import { Button } from "@/components/ui/Button";
import { PageHead } from "@/components/ui/PageHead";
import type { BoardTask } from "@/lib/pulse/board";
import { compareTasks } from "@/lib/tasks/grouping";
import type { TaskActions } from "@/lib/tasks/mutations";
import { closedSections, employeeScreen, employeeTabOf, workingSections, type EmployeeTab, type Section } from "@/lib/tasks/overview";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { TEXT } from "@/lib/tasks/status-text";

import { EmployeeTaskCard } from "./EmployeeTaskCard";
import { StatusScreen } from "./StatusScreen";
import { TabColumnBox, Tabs } from "./Tabs";
import { TaskColumn, useAccordion, useRevealOpen } from "./TaskList";
import { useEmployeeControls } from "./useEmployeeControls";

const DATE_LINE = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });

/**
 * «Мои дела» (D-83): the same screen shape as the director's «Задачи» — a status screen
 * (what to accept, what is late, how much is in hand), three tabs «Новые / В работе /
 * Закрытые», cards that open in place. A new task opens by itself with Принял / Уточнить /
 * Не могу (принцип 2), so accepting stays one tap from the tab bar; the next new one takes
 * its place.
 */
export function EmployeeTasksView({
  meId,
  companyId,
  tasks: all,
  board,
  actions,
  now,
}: {
  meId: string;
  companyId: string;
  /** The employee's own tasks, every status (`useMyTasks`). */
  tasks: readonly TaskWithPeople[];
  /** Their own board rows (`usePulseBoard`): the director's last word and the read cursor. */
  board: readonly BoardTask[];
  actions: TaskActions;
  now: Date;
}) {

  const rows = useMemo(() => new Map(board.map((row) => [row.id, row] as [string, BoardTask])), [board]);
  const screen = useMemo(() => employeeScreen(all, now), [all, now]);

  const piles = useMemo(() => {
    const byTab: Record<EmployeeTab, TaskWithPeople[]> = { new: [], working: [], closed: [] };
    for (const task of all) byTab[employeeTabOf(task)].push(task);
    return byTab;
  }, [all]);

  // the first look opens on what waits for «Принял»; after that the tab is theirs
  const [tab, setTab] = useState<EmployeeTab>(() => (piles.new.length > 0 ? "new" : "working"));
  const current = tab;

  const sections: Section<TaskWithPeople>[] = useMemo(() => {
    if (current === "new") return piles.new.length ? [{ key: "new", title: "", tone: "accent", tasks: [...piles.new].sort(compareTasks) }] : [];
    if (current === "working") return workingSections(piles.working, now);
    return closedSections(piles.closed, now);
  }, [current, piles, now]);

  const ids = useMemo(() => sections.flatMap((section) => section.tasks.map((task) => task.id)), [sections]);
  const accordion = useAccordion(ids, { scope: current, autoOpen: current === "new" });
  useRevealOpen(accordion.openId, accordion.userTouched);

  const byId = (id: string) => all.find((task) => task.id === id) ?? null;

  const { press, sheets } = useEmployeeControls({ actions, companyId, tasks: all });

  const showNearest = (id: string) => {
    const task = byId(id);
    if (!task) return;
    setTab(employeeTabOf(task));
    accordion.focus(id);
  };


  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24">
      <PageHead eyebrow={DATE_LINE.format(now)} title="Мои дела" tone={screen.tone} />

      <div className="mt-3">
        <StatusScreen screen={screen} now={now} onNearest={showNearest} />
      </div>

      <Tabs
        className="mt-2"
        id="mine"
        value={current}
        onChange={(next) => setTab(next)}
        items={[
          { key: "new", label: "Новые", count: piles.new.length, alert: "accent" },
          { key: "working", label: "В работе", count: piles.working.length },
          { key: "closed", label: "Закрытые", count: piles.closed.length },
        ]}
      />

      <TabColumnBox columnKey={current}>
        <TaskColumn
          sections={sections}
          empty={<EmptyState tab={current} nothingAtAll={all.length === 0} working={piles.working.length} onWorking={() => setTab("working")} />}
          renderCard={(task) => (
            <EmployeeTaskCard
              task={task}
              row={rows.get(task.id)}
              meId={meId}
              open={accordion.openId === task.id}
              now={now}
              onToggle={() => accordion.toggle(task.id)}
              onAction={press}
            />
          )}
        />
      </TabColumnBox>

      {sheets}
    </main>
  );
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
  return (
    <p className="rounded-[20px] border border-border/70 px-6 py-8 text-center text-[15px] text-muted">
      {tab === "working" ? TEXT.emptyTasks : "Закрытых пока нет"}
    </p>
  );
}
