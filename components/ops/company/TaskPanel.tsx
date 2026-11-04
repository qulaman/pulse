"use client";

import { useState, type FormEvent } from "react";

import { INPUT } from "@/components/desk/team/fields";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { ActionDialog } from "@/components/ops/ActionDialog";
import { Fact, Field, useOnce } from "@/components/ops/company/shared";
import { deadlineFromInput, deadlineToInput, taskIdIn } from "@/components/ops/company/words";
import { When } from "@/components/ops/shell/When";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { newRequestId } from "@/lib/ops/client";
import { useDeleteTask, useTaskLookup, useUpdateTask } from "@/lib/ops/company-queries";
import type { CompanyCard, OpsTask, UpdateTaskBody } from "@/lib/ops/contract";
import { STATUS_LABEL, type TaskStatus } from "@/lib/tasks/status-text";

type TaskPatch = Pick<UpdateTaskBody, "title" | "body" | "deadline">;

function FindDialog({ companyId, taskId, onClose, onFound }: { companyId: string; taskId: string; onClose: () => void; onFound: (task: OpsTask) => void }) {
  const requestId = useOnce(newRequestId);
  const lookup = useTaskLookup(companyId);
  return (
    <ActionDialog
      title="Открыть задачу"
      description="Текст задачи откроется только после причины и кода из приложения. Запрос останется в журнале."
      confirmLabel="Открыть"
      onClose={onClose}
      onSubmit={async (reason) => {
        const answer = await lookup.mutateAsync({ task_id: taskId, reason, client_request_id: requestId });
        onFound(answer.task);
      }}
    />
  );
}

function EditDialog({ companyId, task, onClose, onSaved }: { companyId: string; task: OpsTask; onClose: () => void; onSaved: (patch: TaskPatch) => void }) {
  const requestId = useOnce(newRequestId);
  const update = useUpdateTask();
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.body ?? "");
  const [deadline, setDeadline] = useState(deadlineToInput(task.deadline));

  const patch: TaskPatch = {};
  if (title.trim() !== task.title) patch.title = title.trim();
  if (body !== (task.body ?? "")) patch.body = body === "" ? null : body;
  if (deadline !== deadlineToInput(task.deadline)) patch.deadline = deadlineFromInput(deadline);

  return (
    <ActionDialog
      title="Изменить задачу"
      description="Правка видна сразу, уведомления никто не получит."
      confirmLabel="Сохранить"
      disabled={Object.keys(patch).length === 0 || title.trim().length === 0}
      onClose={onClose}
      onSubmit={async (reason) => {
        await update.mutateAsync({ taskId: task.id, body: { ...patch, reason, client_request_id: requestId, company_id: companyId } });
        onSaved(patch);
        toast("Задача изменена");
      }}
    >
      <Field label="Заголовок">
        <input className={INPUT} value={title} data-autofocus autoComplete="off" maxLength={500} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Текст">
        <textarea rows={4} className="field w-full px-3 py-2 text-[14px] leading-5" value={body} maxLength={10000} onChange={(event) => setBody(event.target.value)} />
      </Field>
      <Field label="Срок" hint="По времени Актобе. Очисти поле, чтобы снять срок.">
        <input type="datetime-local" className={INPUT} value={deadline} onChange={(event) => setDeadline(event.target.value)} />
      </Field>
    </ActionDialog>
  );
}

function DeleteDialog({ card, task, onClose, onDeleted }: { card: CompanyCard; task: OpsTask; onClose: () => void; onDeleted: () => void }) {
  const requestId = useOnce(newRequestId);
  const remove = useDeleteTask();
  return (
    <ActionDialog
      title="Удалить задачу"
      description={`«${task.title}» исчезнет вместе с перепиской и квитанциями. Начисленные очки останутся, но без привязки к задаче. Отменить нельзя.`}
      confirmLabel="Удалить задачу"
      danger
      confirmName={card.name}
      onClose={onClose}
      onSubmit={async (reason) => {
        await remove.mutateAsync({ taskId: task.id, body: { reason, client_request_id: requestId, company_id: card.id } });
        onDeleted();
        toast("Задача удалена");
      }}
    />
  );
}

/** One task, opened by its id for a reason. Nothing else lists tasks: it stays in this component's state only. */
export function TaskPanel({ card }: { card: CompanyCard }) {
  const [text, setText] = useState("");
  const [task, setTask] = useState<OpsTask | null>(null);
  const [dialog, setDialog] = useState<"find" | "edit" | "delete" | null>(null);

  const taskId = taskIdIn(text);
  const close = () => setDialog(null);
  const find = (event: FormEvent) => {
    event.preventDefault();
    if (taskId) setDialog("find");
  };

  return (
    <div className="flex max-w-[808px] flex-col gap-4" data-testid="ops-task">
      <form onSubmit={find} className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Field
            label="Номер задачи"
            error={text.trim() && !taskId ? "Это не похоже на номер задачи" : null}
            hint="Вставь номер или ссылку на задачу. Списка задач компании в консоли нет."
          >
            <input className={INPUT} value={text} autoComplete="off" spellCheck={false} placeholder="00000000-0000-0000-0000-000000000000" onChange={(event) => setText(event.target.value)} data-testid="ops-task-id" />
          </Field>
        </div>
        <Button size="sm" type="submit" className="mt-[26px]" disabled={!taskId} data-testid="ops-task-find">
          Найти
        </Button>
      </form>

      {task ? (
        <section className="flex flex-col gap-2" data-testid="ops-task-card">
          <SectionLabel
            action={
              <>
                <Button size="sm" variant="secondary" onClick={() => setDialog("edit")} data-testid="ops-task-edit">
                  Изменить
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDialog("delete")} data-testid="ops-task-delete">
                  Удалить
                </Button>
              </>
            }
          >
            Задача
          </SectionLabel>
          <dl className="rounded-[12px] border border-border bg-surface/40">
            <Fact label="Заголовок">{task.title}</Fact>
            <Fact label="Текст">{task.body || <span className="text-muted">нет</span>}</Fact>
            <Fact label="Статус">{STATUS_LABEL[task.status as TaskStatus] ?? task.status}</Fact>
            <Fact label="Срок">
              <When iso={task.deadline} />
            </Fact>
            <Fact label="Автор">{task.author ?? <span className="text-muted">нет</span>}</Fact>
            <Fact label="Исполнитель">{task.assignee ?? <span className="text-muted">нет</span>}</Fact>
            <Fact label="Создана">
              <When iso={task.created_at} />
            </Fact>
          </dl>
        </section>
      ) : (
        <EmptyState title="Задача не выбрана" hint="Здесь появится одна задача, которую ты откроешь по номеру. Уйдёшь с раздела, и она закроется." />
      )}

      {dialog === "find" && taskId ? <FindDialog companyId={card.id} taskId={taskId} onClose={close} onFound={setTask} /> : null}
      {dialog === "edit" && task ? <EditDialog companyId={card.id} task={task} onClose={close} onSaved={(patch) => setTask({ ...task, ...patch })} /> : null}
      {dialog === "delete" && task ? (
        <DeleteDialog
          card={card}
          task={task}
          onClose={close}
          onDeleted={() => {
            setTask(null);
            setText("");
          }}
        />
      ) : null}
    </div>
  );
}
