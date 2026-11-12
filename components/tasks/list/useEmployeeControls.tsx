"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";

import { useFlightTarget } from "@/components/feed/FlightTarget";
import { PeoplePicker } from "@/components/people/PeoplePicker";
import { AskSheet, CantSheet, ReportSheet } from "@/components/tasks/TaskSheets";
import { SHEET_CLOSE_MS } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { haptic } from "@/lib/haptics";
import { shortName } from "@/lib/people/names";
import { NOT_MINE, requestToast } from "@/lib/tasks/lifecycle";
import { showHandedIn, type TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { TEXT } from "@/lib/tasks/status-text";
import { flyAway, flyInto } from "@/lib/ui/flyAway";

import type { EmployeeAction } from "./EmployeeTaskCard";

type SheetState = { name: "ask" | "cant" | "report" | "pass"; taskId: string; words?: string } | null;

/**
 * What the employee's three buttons do, wherever a task shows them — a card of «Мои дела»
 * or the task's own screen (D-83, D-87): «Принял» at once with a receipt, «Уточнить»,
 * «Не могу» and «Выполнено» through their sheets. «Не могу» is the sheet of D-128: more time
 * (the task stays in work), «это не ко мне» with a colleague's name, or a real refusal.
 * One hook, one meaning per button.
 *
 * On a screen with a flight target (Лента, D-167) a press that is given its card answers with
 * motion over data already written: «Принял» sends a copy of the card into the face's hands,
 * a report handed in sends one up to the director — there «Принято · в работе» and «Сдано на
 * проверку» are not toasted (tasks/032); failures and toasts with «Отменить» still are. The card
 * itself never hides — a write that fails leaves it where it was, and the flight was only ever a copy.
 */
export function useEmployeeControls({
  actions,
  companyId,
  tasks,
}: {
  actions: TaskActions;
  companyId: string;
  tasks: readonly TaskWithPeople[];
}): { press: (action: EmployeeAction, task: TaskWithPeople, card?: HTMLElement | null) => void; sheets: ReactNode } {
  const queryClient = useQueryClient();
  const flight = useFlightTarget();
  const [sheet, setSheet] = useState<SheetState>(null);
  // the card «Выполнено» was pressed on: its copy goes up from there once the report is handed in
  const reportCard = useRef<{ taskId: string; node: HTMLElement } | null>(null);
  // the task the sheets were last opened for: they stay mounted while they slide away
  const [heldId, setHeldId] = useState<string | null>(null);
  const sheetTask = tasks.find((task) => task.id === (sheet?.taskId ?? heldId)) ?? null;

  const open = (next: NonNullable<SheetState>) => {
    setHeldId(next.taskId);
    setSheet(next);
  };

  /** The report went (or is kept for the network): a copy of the card rises to the director. */
  const handedIn = (taskId: string) => {
    const card = reportCard.current;
    reportCard.current = null;
    if (!flight || !card || card.taskId !== taskId || !card.node.isConnected) return;
    // measured now, as the sheet leaves: the copy rises from the card's place under the sheet's
    // dim (z 50) while it slides away, and is clear of the card by the time the dim is gone
    flyAway([card.node], { keep: true, z: 49, windUp: false, duration: 480 });
  };

  const press = (action: EmployeeAction, task: TaskWithPeople, card?: HTMLElement | null) => {
    if (action === "accept") {
      haptic(15);
      actions.transition({ taskId: task.id, toStatus: "accepted" });
      // where cards fly the flight and the face are the answer: a toast up top would lie over the face's words
      if (!flight) toast("Принято · в работе");
      // written first; the copy is taken before React redraws the card in its new state
      const face = flight?.getTarget();
      if (card && face) flyInto(card, face, { onLand: flight?.onLand });
      return;
    }
    reportCard.current = action === "complete" && card ? { taskId: task.id, node: card } : null;
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
            setTimeout(() => open({ name: "pass", taskId, words }), SHEET_CLOSE_MS);
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
            toast(`Вернул директору · предложил: ${shortName(person.full_name)}`);
          }}
        />
      ) : null}
      <ReportSheet
        open={sheet?.name === "report"}
        onClose={() => setSheet(null)}
        keep={
          sheetTask?.assignee_id
            ? {
                taskId: sheetTask.id,
                companyId,
                userId: sheetTask.assignee_id,
                onKept: (partial) => {
                  showHandedIn(queryClient, sheetTask.id);
                  handedIn(sheetTask.id);
                  haptic(15);
                  toast(partial ? "Нет связи. Сдам с фото, как появится · не всё" : "Нет связи. Сдам с фото, как появится");
                },
              }
            : undefined
        }
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
          handedIn(sheetTask.id);
          haptic(15);
          // on Лента the copy rising to the director says it (D-167); elsewhere the toast does
          if (!flight) toast(partial ? "Сдано на проверку · не всё" : "Сдано на проверку директору");
        }}
      />
    </>
  );

  return { press, sheets };
}
