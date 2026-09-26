"use client";

import { useState, type ReactNode } from "react";

import { PeoplePicker } from "@/components/people/PeoplePicker";
import { AskSheet, CantSheet, ReportSheet } from "@/components/tasks/TaskSheets";
import { toast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import { NOT_MINE, requestToast } from "@/lib/tasks/lifecycle";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { TEXT } from "@/lib/tasks/status-text";

import type { EmployeeAction } from "./EmployeeTaskCard";

type SheetState = { name: "ask" | "cant" | "report" | "pass"; taskId: string; words?: string } | null;

const firstName = (full: string | null | undefined) => full?.trim().split(/\s+/)[0] ?? "";

/**
 * What the employee's three buttons do, wherever a task shows them — a card of «Мои дела»
 * or the task's own screen (D-83, D-87): «Принял» at once with a receipt, «Уточнить»,
 * «Не могу» and «Выполнено» through their sheets. «Не могу» is the sheet of D-128: more time
 * (the task stays in work), «это не ко мне» with a colleague's name, or a real refusal.
 * One hook, one meaning per button.
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
  // the task the sheets were last opened for: they stay mounted while they slide away
  const [heldId, setHeldId] = useState<string | null>(null);
  const sheetTask = tasks.find((task) => task.id === (sheet?.taskId ?? heldId)) ?? null;

  const open = (next: NonNullable<SheetState>) => {
    setHeldId(next.taskId);
    setSheet(next);
  };

  const press = (action: EmployeeAction, task: TaskWithPeople) => {
    if (action === "accept") {
      haptic(15);
      actions.transition({ taskId: task.id, toStatus: "accepted" });
      toast("Принято · в работе");
      return;
    }
    open({ name: action === "complete" ? "report" : action === "decline" ? "cant" : action, taskId: task.id });
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
      {sheetTask ? (
        <CantSheet
          open={sheet?.name === "cant"}
          onClose={() => setSheet((was) => (was?.name === "cant" ? null : was))}
          status={sheetTask.status}
          deadline={sheetTask.deadline}
          onTime={(iso, words) => {
            haptic(12);
            actions.requestTime({ taskId: sheetTask.id, fromStatus: sheetTask.status, proposedIso: iso, words: words || undefined });
            toast(requestToast(sheetTask.status, iso));
          }}
          onDecline={(reason) => {
            actions.transition({ taskId: sheetTask.id, toStatus: "declined", reason });
            toast(reason.startsWith(NOT_MINE) ? "Вернул директору" : "Сообщил директору");
          }}
          onPass={(words) => {
            // the sheet leaves first, the picker slides in after it (as «Все действия» does)
            const taskId = sheetTask.id;
            setSheet(null);
            setTimeout(() => open({ name: "pass", taskId, words }), 170);
          }}
        />
      ) : null}
      {sheetTask ? (
        <PeoplePicker
          open={sheet?.name === "pass"}
          onClose={() => setSheet((was) => (was?.name === "pass" ? null : was))}
          title={TEXT.passTitle}
          subject={sheetTask.title}
          hint={TEXT.passHint}
          hideIds={[sheetTask.assignee_id, sheetTask.author_id]}
          onPick={(person) => {
            const words = sheet?.words?.trim();
            actions.transition({
              taskId: sheetTask.id,
              toStatus: "declined",
              reason: words ? `${NOT_MINE}. ${words}` : NOT_MINE,
              suggestAssigneeId: person.id,
            });
            toast(`Вернул директору · предложил: ${firstName(person.full_name)}`);
          }}
        />
      ) : null}
      <ReportSheet
        open={sheet?.name === "report"}
        onClose={() => setSheet(null)}
        onSubmit={(text, filePath, partial) => {
          if (!sheetTask) return;
          // one call: the words, the photo and the handover are one transaction (D-64 §3)
          actions.complete({
            taskId: sheetTask.id,
            fromStatus: sheetTask.status,
            report:
              text || filePath || partial
                ? { text: text || undefined, file_path: filePath ?? undefined, partial: partial || undefined }
                : undefined,
          });
          haptic(15);
          toast(partial ? "Сдано на проверку · не всё" : "Сдано на проверку директору");
        }}
      />
    </>
  );

  return { press, sheets };
}
