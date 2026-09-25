"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { AnswerSheet } from "@/components/tasks/desk/AnswerSheet";
import { DirectorSheets, type DirectorSheetName } from "@/components/tasks/desk/DirectorSheets";
import { Icon } from "@/components/tasks/desk/icons";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { haptic } from "@/lib/haptics";
import type { DeskAction } from "@/lib/tasks/desk";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";

import { ACTION_ICON, ACTION_LABEL, allActionsFor } from "./DirectorTaskCard";

type SheetState = { name: DirectorSheetName | "answer" | "more"; taskId: string } | null;

function firstName(full: string | null | undefined): string {
  return full?.trim().split(/\s+/)[0] ?? "";
}

/**
 * What the director's buttons do, wherever a task shows them — a card of «Задачи» or the
 * task's own screen (D-83, D-87): the existing actions with a receipt in words («Принято ·
 * Асхат»), the sheets that ask before a move (доработка, срок, кому, отзыв, удаление, ответ
 * словами), and «Все действия». One hook, so a button cannot mean two things on two screens.
 */
export function useDirectorControls({
  base,
  companyId,
  tasks,
  questionOf,
  now,
  onThread = true,
  afterRemove,
}: {
  base: TaskActions;
  companyId: string;
  /** every task these controls may be asked about */
  tasks: readonly TaskWithPeople[];
  /** the employee's open question of a task, for «Ответить словами» */
  questionOf: (taskId: string) => string | null;
  now: Date;
  /** «Открыть переписку» in «Все действия» — off on the task's own screen */
  onThread?: boolean;
  /** after «Удалить» — the task's own screen has nothing left to show */
  afterRemove?: () => void;
}): {
  actions: TaskActions;
  press: (action: DeskAction, task: TaskWithPeople) => void;
  answer: (task: TaskWithPeople, text: string | null) => void;
  more: (task: TaskWithPeople) => void;
  sheets: ReactNode;
} {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>(null);

  const byId = (id: string) => tasks.find((task) => task.id === id) ?? null;
  const named = (text: string, task: TaskWithPeople) => {
    const who = firstName(task.assignee?.full_name);
    return who ? `${text} · ${who}` : text;
  };

  // the same actions with a receipt in words: the card leaves under the thumb, the toast says where it went
  const actions: TaskActions = {
    ...base,
    transition: (input) => {
      const task = byId(input.taskId);
      base.transition(input);
      if (!task) return;
      if (input.toStatus === "done") toast(named("Принято", task));
      else if (input.toStatus === "rework") toast(named("На доработку", task));
      else if (input.toStatus === "sent") toast(named("Снова отправлено", task));
    },
    extend: (input) => {
      base.extend(input);
      toast(input.deadlineIso ? `Срок: ${humanAqtobe(new Date(input.deadlineIso), now)}` : "Теперь без срока");
    },
    revoke: (taskId) => {
      base.revoke(taskId);
      toast("Отозвано");
    },
  };

  const press = (action: DeskAction, task: TaskWithPeople) => {
    switch (action) {
      case "approve":
        haptic(15);
        actions.transition({ taskId: task.id, toStatus: "done" });
        return;
      case "insist":
        actions.transition({ taskId: task.id, toStatus: "sent" });
        return;
      case "sendNow":
        // held for the morning: it goes now (D-128); the toast comes with the mutation
        haptic(10);
        actions.sendNow(task.id);
        return;
      case "open":
        router.push(`/tasks/${task.id}`);
        return;
      case "answer":
        setSheet({ name: "answer", taskId: task.id });
        return;
      case "cancel":
      case "revoke":
        setSheet({ name: "revoke", taskId: task.id });
        return;
      case "remove":
        setSheet({ name: "delete", taskId: task.id });
        return;
      default:
        setSheet({ name: action, taskId: task.id });
    }
  };

  const answer = (task: TaskWithPeople, text: string | null) => {
    if (!text) {
      setSheet({ name: "answer", taskId: task.id });
      return;
    }
    haptic(10);
    actions.sendMessage({ taskId: task.id, companyId, text });
    toast(named("Ответ ушёл", task));
  };

  const sheetTask = sheet ? byId(sheet.taskId) : null;
  const question = sheetTask ? questionOf(sheetTask.id) : null;
  const choices: DeskAction[] = sheetTask ? [...allActionsFor(sheetTask), ...(onThread ? (["open"] as const) : [])] : [];

  const sheets = sheetTask ? (
    <>
      <DirectorSheets
        task={sheetTask}
        open={sheet && sheet.name !== "answer" && sheet.name !== "more" ? sheet.name : null}
        onClose={() => setSheet(null)}
        actions={actions}
        afterRemove={afterRemove}
      />
      {question ? (
        <AnswerSheet
          open={sheet?.name === "answer"}
          onClose={() => setSheet(null)}
          taskId={sheetTask.id}
          companyId={companyId}
          question={question}
          actions={{
            ...actions,
            sendMessage: (input) => {
              actions.sendMessage(input);
              toast(named("Ответ ушёл", sheetTask));
            },
          }}
        />
      ) : null}
      <Sheet open={sheet?.name === "more"} onClose={() => setSheet(null)} title="Действия">
        <p className="-mt-1 line-clamp-2 text-[14px] leading-[19px] text-muted">{sheetTask.title}</p>
        <div className="mt-3 flex flex-col gap-1">
          {choices.map((action) => {
            const danger = action === "remove" || action === "cancel" || action === "revoke";
            const icon = action === "open" ? "reply" : (ACTION_ICON[action] ?? "open");
            return (
              <button
                key={action}
                type="button"
                data-testid={`more-${action}`}
                onClick={() => {
                  setSheet(null);
                  // the next sheet slides in after this one has gone
                  setTimeout(() => press(action, sheetTask), action === "approve" || action === "insist" || action === "sendNow" || action === "open" ? 0 : 170);
                }}
                className={`flex min-h-[52px] items-center gap-3 rounded-[14px] px-3 text-left text-[16px] font-medium transition-colors duration-[120ms] active:bg-surface-2 ${
                  danger ? "text-danger" : "text-text"
                }`}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-[11px]"
                  style={{ background: danger ? "color-mix(in srgb, var(--danger) 12%, transparent)" : "var(--surface-2)" }}
                >
                  <Icon name={icon} size={18} />
                </span>
                <span className="flex-1">{action === "open" ? "Открыть переписку" : action === "reassign" ? "Переназначить" : ACTION_LABEL[action]}</span>
                <span className="text-muted">
                  <Icon name="open" size={14} />
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  ) : null;

  return { actions, press, answer, more: (task) => setSheet({ name: "more", taskId: task.id }), sheets };
}
