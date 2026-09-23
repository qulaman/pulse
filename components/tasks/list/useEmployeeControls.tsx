"use client";

import { useState, type ReactNode } from "react";

import { AskSheet, DeclineSheet, ReportSheet } from "@/components/tasks/TaskSheets";
import { toast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { TEXT } from "@/lib/tasks/status-text";

import type { EmployeeAction } from "./EmployeeTaskCard";

type SheetState = { name: "ask" | "decline" | "report"; taskId: string } | null;

/**
 * What the employee's three buttons do, wherever a task shows them — a card of «Мои дела»
 * or the task's own screen (D-83, D-87): «Принял» at once with a receipt, «Уточнить»,
 * «Не могу» and «Выполнено» through their sheets. One hook, one meaning per button.
 */
export function useEmployeeControls({
  actions,
  companyId,
  tasks,
}: {
  actions: TaskActions;
  companyId: string;
  tasks: readonly TaskWithPeople[];
}): { press: (action: EmployeeAction, task: TaskWithPeople) => void; sheets: ReactNode } {
  const [sheet, setSheet] = useState<SheetState>(null);
  const sheetTask = sheet ? (tasks.find((task) => task.id === sheet.taskId) ?? null) : null;

  const press = (action: EmployeeAction, task: TaskWithPeople) => {
    if (action === "accept") {
      haptic(15);
      actions.transition({ taskId: task.id, toStatus: "accepted" });
      toast("Принято · в работе");
      return;
    }
    setSheet({ name: action === "complete" ? "report" : action, taskId: task.id });
  };

  const sheets = (
    <>
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
    </>
  );

  return { press, sheets };
}
