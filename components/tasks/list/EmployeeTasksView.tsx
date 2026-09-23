"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/tasks/desk/icons";
import { AskSheet, DeclineSheet, ReportSheet } from "@/components/tasks/TaskSheets";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import type { BoardTask } from "@/lib/pulse/board";
import { compareTasks } from "@/lib/tasks/grouping";
import type { TaskActions } from "@/lib/tasks/mutations";
import { closedSections, employeeScreen, employeeTabOf, workingSections, type EmployeeTab, type Section } from "@/lib/tasks/overview";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { TEXT } from "@/lib/tasks/status-text";

import { EmployeeTaskCard, type EmployeeAction } from "./EmployeeTaskCard";
import { StatusScreen } from "./StatusScreen";
import { Tabs } from "./Tabs";
import { TaskColumn, useAccordion, useRevealOpen } from "./TaskList";

const DATE_LINE = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });

type SheetState = { name: "ask" | "decline" | "report"; taskId: string } | null;

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
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>(null);

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

  const press = (action: EmployeeAction, task: TaskWithPeople) => {
    if (action === "accept") {
      haptic(15);
      actions.transition({ taskId: task.id, toStatus: "accepted" });
      toast("Принято · в работе");
      return;
    }
    setSheet({ name: action === "complete" ? "report" : action, taskId: task.id });
  };

  const showNearest = (id: string) => {
    const task = byId(id);
    if (!task) return;
    setTab(employeeTabOf(task));
    accordion.focus(id);
  };

  const sheetTask = sheet ? byId(sheet.taskId) : null;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-3">
      <div className="px-0.5">
        <p className="text-[13px] font-medium leading-4 text-muted first-letter:uppercase">{DATE_LINE.format(now)}</p>
        <h1 className="mt-0.5 text-[30px] font-bold leading-[36px]">Мои дела</h1>
      </div>

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

      <div key={current} className="card-in mt-1">
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
              onThread={(t) => router.push(`/tasks/${t.id}`)}
            />
          )}
        />
      </div>

      <AskSheet
        open={sheet?.name === "ask"}
        onClose={() => setSheet(null)}
        onSubmit={(text) => {
          if (!sheetTask) return;
          actions.sendMessage({ taskId: sheetTask.id, companyId, text, meta: { is_question: true } });
          toast(TEXT.askedToast);
        }}
      />
      <DeclineSheet
        open={sheet?.name === "decline"}
        onClose={() => setSheet(null)}
        onSubmit={(reason) => {
          if (!sheetTask) return;
          actions.transition({ taskId: sheetTask.id, toStatus: "declined", reason });
          toast("Сообщил директору");
        }}
      />
      <ReportSheet
        open={sheet?.name === "report"}
        onClose={() => setSheet(null)}
        onSubmit={(text, filePath) => {
          if (!sheetTask) return;
          // one call: the words, the photo and the handover are one transaction (D-64 §3)
          actions.complete({
            taskId: sheetTask.id,
            fromStatus: sheetTask.status,
            report: text || filePath ? { text: text || undefined, file_path: filePath ?? undefined } : undefined,
          });
          haptic(15);
          toast("Сдано на проверку директору");
        }}
      />
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
      <div className="mt-3 flex flex-col items-center rounded-[20px] border border-border/70 px-6 py-10 text-center">
        <Mascot state="calm" size={64} />
        <p className="mt-4 text-[16px] leading-[22px]">{TEXT.emptyFeed}</p>
      </div>
    );
  }
  if (tab === "new") {
    return (
      <div className="mt-3 flex flex-col items-center rounded-[20px] border border-border/70 px-6 py-9 text-center">
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
    <p className="mt-3 rounded-[20px] border border-border/70 px-6 py-8 text-center text-[15px] text-muted">
      {tab === "working" ? TEXT.emptyTasks : "Закрытых пока нет"}
    </p>
  );
}
