"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { UrgentSwitch } from "@/components/desk/confirm/EntityEditor";
import { PersonField, type PickPerson } from "@/components/desk/confirm/PersonField";
import { WhenField } from "@/components/desk/confirm/WhenField";
import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Button } from "@/components/ui/Button";
import { shortName } from "@/lib/people/names";
import { useRoster } from "@/lib/people/roster";
import { canChangePerson, draftOf, noticeOf, planOf, problemOf, type EditDraft, type EditPlan } from "@/lib/tasks/edit";
import { useMe, type TaskWithPeople } from "@/lib/tasks/queries";

import { FaceName } from "./Face";

/** Esc twice within this to drop what was changed (В-12 з), as «Что доработать?» has it. */
const ESC_ARM_MS = 4000;

const LABEL = "tasks-edit-label pt-[7px] text-[13px] leading-5 text-muted";

/** A field of words that grows with them; `oneLine` — Enter saves instead of breaking the line. */
function GrowArea({
  value,
  onChange,
  onEnter,
  label,
  placeholder,
  maxLength,
  invalid,
  autoFocus,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Enter without Shift: the words are one paragraph, Enter saves */
  onEnter?: () => void;
  label: string;
  placeholder?: string;
  maxLength: number;
  invalid?: boolean;
  autoFocus?: boolean;
  testId?: string;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={area}
      rows={1}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      data-autofocus={autoFocus ? "" : undefined}
      spellCheck
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (onEnter && event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onEnter();
        }
      }}
      data-testid={testId}
      className="desk-input block min-h-9 w-full resize-none overflow-hidden px-0 py-[7px] text-[14px] leading-5 outline-none placeholder:text-muted"
    />
  );
}

/**
 * «Изменить задачу» (D-200) — the desk's form of one open task: who, the words, the details, the
 * deadline, «срочно»; with another person, a word for them. The fields are the confirm's own
 * (`PersonField`, `WhenField`, `UrgentSwitch`), so a task is edited the way it was born. What stops
 * the save is said at its field; the line at the foot says who will learn of it (principle 8).
 * Ctrl+Enter or Enter in the words saves; Esc with changes asks twice. The save closes the form at
 * once — every screen shows the new words, the call goes after (`useEditTask`).
 */
export function TaskEditDialog({
  task,
  onClose,
  onSave,
}: {
  task: TaskWithPeople;
  onClose: () => void;
  onSave: (plan: EditPlan) => void;
}) {
  const roster = useRoster();
  const meId = useMe().data?.userId ?? null;
  const [draft, setDraft] = useState<EditDraft>(() => draftOf(task));
  const [armed, setArmed] = useState(false);

  const people = useMemo<PickPerson[]>(
    () =>
      (roster.data ?? [])
        .filter((person) => person.id !== meId || person.id === task.assignee_id)
        .map((person) => ({ id: person.id, full_name: person.full_name, position: person.position })),
    [roster.data, meId, task.assignee_id],
  );
  const plan = planOf(task, draft);
  const problem = problemOf(task, draft, new Date());
  const movable = canChangePerson(task.status);
  const moving = Boolean(plan.assignee);
  const names = { now: shortName(task.assignee?.full_name), next: plan.assignee ? shortName(plan.assignee.name) : undefined };

  const set = (patch: Partial<EditDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setArmed(false);
  };
  const askClose = () => {
    if (plan.changed && !armed) {
      setArmed(true);
      return;
    }
    onClose();
  };
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), ESC_ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const save = () => {
    if (!plan.changed || problemOf(task, draft, new Date())) return;
    onSave(plan);
    onClose();
  };

  return (
    <Dialog open onClose={askClose} title="Изменить задачу" width="md">
      <form
        className="tasks-edit flex flex-col gap-1"
        data-testid="desk-task-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && (event.code === "Enter" || event.code === "NumpadEnter" || event.code === "KeyS")) {
            event.preventDefault();
            save();
          }
        }}
      >
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
          <span className={LABEL}>Кому</span>
          <div className="min-w-0">
            {movable ? (
              <PersonField
                value={draft.assigneeId}
                name={draft.assigneeName}
                people={people}
                label="Кому"
                onPick={(person) => set({ assigneeId: person.id, assigneeName: person.full_name })}
                testId="desk-edit-who"
              />
            ) : (
              <div className="flex min-h-9 flex-col justify-center py-1" data-testid="desk-edit-who-fixed">
                <FaceName id={task.assignee_id} name={task.assignee?.full_name} size={20} full />
                <span className="text-[12px] leading-4 text-muted">Работа сдана — сменить человека можно после «Принять» или «На доработку»</span>
              </div>
            )}
          </div>

          {moving && task.status !== "scheduled" ? (
            <>
              <span className={LABEL}>Сказать</span>
              <input
                value={draft.note}
                onChange={(event) => set({ note: event.target.value })}
                maxLength={500}
                placeholder="Слово новому исполнителю — можно не писать"
                aria-label="Слово новому исполнителю"
                data-testid="desk-edit-note"
                className="desk-input h-9 w-full px-0 text-[14px] leading-5 outline-none placeholder:text-muted"
              />
            </>
          ) : null}

          <span className={LABEL}>Что</span>
          <div className="min-w-0">
            <GrowArea
              value={draft.title}
              onChange={(title) => set({ title })}
              onEnter={save}
              label="Что сделать"
              maxLength={500}
              invalid={problem?.field === "title"}
              autoFocus
              testId="desk-edit-title"
            />
            {problem?.field === "title" ? <p className="pb-1 text-[12px] leading-4 text-danger">{problem.text}</p> : null}
          </div>

          <span className={LABEL}>Подробности</span>
          <GrowArea value={draft.body} onChange={(body) => set({ body })} label="Подробности" placeholder="Можно не писать" maxLength={4000} testId="desk-edit-body" />

          <span className={LABEL}>Срок</span>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <WhenField
                  value={draft.deadline}
                  label="Срок"
                  emptyText={draft.urgent ? "срочно — без срока" : "без срока"}
                  tone={problem?.field === "deadline" ? "danger" : undefined}
                  onChange={(deadline) => set({ deadline })}
                  testId="desk-edit-when"
                />
              </div>
              <UrgentSwitch on={draft.urgent} onChange={(urgent) => set({ urgent })} />
            </div>
            {problem?.field === "deadline" ? (
              <p className="pb-1 text-[12px] leading-4 text-danger" data-testid="desk-edit-problem">
                {problem.text}
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-3 border-t border-border pt-2.5 text-[13px] leading-5 text-muted" data-testid="desk-edit-notice" aria-live="polite">
          {noticeOf(task, plan, names)}
        </p>

        <div className="mt-2 flex items-center gap-2">
          {armed ? (
            <span className="mr-auto text-[12px] leading-4" style={{ color: "var(--warn)" }} aria-live="polite" data-testid="desk-edit-armed">
              Не сохранено — <Kbd>Esc</Kbd> ещё раз, чтобы закрыть
            </span>
          ) : (
            <span className="mr-auto flex items-center gap-1 text-[12px] leading-4 text-muted">
              <Kbd>Ctrl</Kbd>
              <Kbd>Enter</Kbd>
              <span className="ml-1">сохранить</span>
            </span>
          )}
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" size="sm" disabled={!plan.changed || Boolean(problem)} data-testid="desk-edit-save">
            Сохранить
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
