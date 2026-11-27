"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { UrgentSwitch } from "@/components/desk/confirm/EntityEditor";
import { PersonField, type PickPerson } from "@/components/desk/confirm/PersonField";
import { WhenField } from "@/components/desk/confirm/WhenField";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { shortName } from "@/lib/people/names";
import { useRoster } from "@/lib/people/roster";
import { canChangePerson, canEdit, draftOf, noticeOf, planOf, problemOf, type EditDraft } from "@/lib/tasks/edit";
import { useMe, type TaskWithPeople } from "@/lib/tasks/queries";
import { useQuietHours } from "@/lib/voice/quietHours";

import { FaceName } from "./Face";
import { useCallFirst } from "./RowMoves";
import type { DeskTask } from "./useDeskTask";

/** Esc twice within this to drop what was changed (В-12 з), as «Что доработать?» has it. */
const ESC_ARM_MS = 4000;

/** Handed-in work keeps its person (D-200): a person picked before the hand-in is not sent after it. */
function withoutMove(plan: ReturnType<typeof planOf>, task: TaskWithPeople): ReturnType<typeof planOf> {
  if (!plan.assignee || canChangePerson(task.status)) return plan;
  const rest = { ...plan, assignee: undefined, note: undefined };
  const changed = rest.title !== task.title.trim() || rest.body !== (task.body?.trim() || null) || rest.priority !== undefined || rest.deadline !== undefined;
  return { ...rest, changed };
}

const LABEL = "tasks-edit-label pt-2 text-[13px] leading-5";

/** A field of words that grows with them; `onEnter` — Enter saves instead of breaking the line. */
function GrowArea({
  value,
  onChange,
  onEnter,
  label,
  placeholder,
  maxLength,
  invalid,
  autoFocus,
  className = "",
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  label: string;
  placeholder?: string;
  maxLength: number;
  invalid?: boolean;
  autoFocus?: boolean;
  className?: string;
  testId?: string;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight + 2}px`;
  }, [value]);
  useEffect(() => {
    if (!autoFocus) return;
    const node = area.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    // the caret at the end of the words: the director goes on from them
    node.setSelectionRange(node.value.length, node.value.length);
  }, [autoFocus]);
  return (
    <textarea
      ref={area}
      rows={1}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      spellCheck
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (onEnter && event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onEnter();
        }
      }}
      data-testid={testId}
      className={`desk-input block w-full resize-none overflow-hidden text-[14px] leading-5 outline-none placeholder:text-muted ${className}`}
    />
  );
}

/**
 * «Изменить задачу» in the panel itself (D-200, D-203): the task's own rows turn into fields — the
 * words, «Кому», «Срок» with «Срочно», the details; with another person, a word for them. The
 * fields are the confirm's own (`PersonField`, `WhenField`, `UrgentSwitch`), so a task is changed
 * the way it was born. What stops the save is said at its field; the foot says who will learn of
 * it and when (principle 8) — beside «Отмена» and «Сохранить». Ctrl+Enter (or Ctrl+S, or Enter in
 * the words) saves; Esc with changes asks twice. The save leaves the form at once: every screen
 * shows the new words, the call goes after (`useEditTask`).
 */
export function TaskEditForm({ desk, onDone }: { desk: DeskTask; onDone: (saved: boolean) => void }) {
  const task = desk.task as TaskWithPeople;
  const roster = useRoster();
  const meId = useMe().data?.userId ?? null;
  const reach = useCallFirst();
  const hours = useQuietHours();
  const [draft, setDraft] = useState<EditDraft>(() => draftOf(task));
  const [armed, setArmed] = useState(false);

  // a form is up: the desk's letters stay away from its buttons (keysTaken)
  useEffect(() => {
    document.body.setAttribute("data-task-edit", "");
    return () => document.body.removeAttribute("data-task-edit");
  }, []);

  const people = useMemo<PickPerson[]>(
    () =>
      (roster.data ?? [])
        .filter((person) => person.id !== meId || person.id === task.assignee_id)
        .map((person) => ({ id: person.id, full_name: person.full_name, position: person.position })),
    [roster.data, meId, task.assignee_id],
  );
  // a person picked before the work was handed in is not sent once it is (canChangePerson)
  const plan = withoutMove(planOf(task, draft), task);
  const problem = problemOf(task, draft, new Date());
  const movable = canChangePerson(task.status);
  const moving = Boolean(plan.assignee) && task.status !== "scheduled";
  const holder = plan.assignee?.id ?? task.assignee_id;
  const notice = noticeOf(task, plan, {
    now: shortName(task.assignee?.full_name),
    next: plan.assignee ? shortName(plan.assignee.name) : undefined,
    noPush: reach.noPush.has(holder),
    waitsUntil: hours.quiet ? hours.opensAt : null,
  });

  const set = (patch: Partial<EditDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setArmed(false);
  };
  const cancel = () => {
    if (plan.changed && !armed) {
      setArmed(true);
      return;
    }
    onDone(false);
  };
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), ESC_ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  // the task was closed while the form was up (accepted, recalled): nothing left to change
  const open = canEdit(task.status);
  const done = useRef(onDone);
  useLayoutEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (open) return;
    toast("Задача уже закрыта — правка не сохранена");
    done.current(false);
  }, [open]);

  // Esc from anywhere while the form is up — the caret in a field or not: the form takes it before
  // the desk's own Esc would close the panel and drop the words (DeskShell listens later)
  const cancelRef = useRef(cancel);
  useLayoutEffect(() => {
    cancelRef.current = cancel;
  });
  useEffect(() => {
    const onEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // a list or a calendar open over a field takes its own Esc (its listener comes after this one)
      if (document.querySelector(".desk-pop")) return;
      event.preventDefault();
      event.stopPropagation();
      cancelRef.current();
    };
    window.addEventListener("keydown", onEsc, true);
    return () => window.removeEventListener("keydown", onEsc, true);
  }, []);

  const save = () => {
    if (!open || !plan.changed || problemOf(task, draft, new Date())) return;
    const who = shortName(task.assignee?.full_name);
    desk.acts.actions.edit({
      taskId: task.id,
      title: plan.title,
      body: plan.body,
      priority: plan.priority,
      deadline: plan.deadline,
      assignee: plan.assignee,
      note: plan.note,
      receipt: who ? `Изменено · ${who}` : "Изменено",
    });
    onDone(true);
  };

  const onKey = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.ctrlKey || event.metaKey) && (event.code === "Enter" || event.code === "NumpadEnter" || event.code === "KeyS")) {
      event.preventDefault();
      save();
      return;
    }
  };

  return (
    <form
      className="tasks-edit flex flex-col"
      data-testid="desk-task-edit-form"
      aria-label="Изменить задачу"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      onKeyDown={onKey}
    >
      <GrowArea
        value={draft.title}
        onChange={(title) => set({ title })}
        onEnter={save}
        label="Что сделать"
        maxLength={500}
        invalid={problem?.field === "title"}
        autoFocus
        className="tasks-edit-title"
        testId="desk-edit-title"
      />
      {problem?.field === "title" ? <p className="tasks-edit-problem">{problem.text}</p> : null}

      <div className="tasks-edit-grid grid items-start gap-x-3">
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
            <div className="flex min-h-9 flex-col justify-center" data-testid="desk-edit-who-fixed">
              <FaceName id={task.assignee_id} name={task.assignee?.full_name} size={20} full />
              <span className="text-[12px] leading-4 text-muted">Работа сдана — сменить человека можно после «Принять» или «На доработку»</span>
            </div>
          )}
        </div>

        {moving ? (
          <>
            <span className={LABEL}>Слово</span>
            <input
              value={draft.note}
              onChange={(event) => set({ note: event.target.value })}
              maxLength={500}
              placeholder={`Что сказать: ${shortName(plan.assignee?.name) || "новому"} — можно не писать`}
              aria-label="Слово новому исполнителю"
              data-testid="desk-edit-note"
              className="desk-input h-9 w-full text-[14px] leading-5 outline-none placeholder:text-muted"
            />
          </>
        ) : null}

        <span className={LABEL}>Срок</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <WhenField
                value={draft.deadline}
                label="Срок"
                emptyText="без срока"
                tone={problem?.field === "deadline" ? "danger" : undefined}
                onChange={(deadline) => set({ deadline })}
                testId="desk-edit-when"
              />
            </div>
            <UrgentSwitch on={draft.urgent} onChange={(urgent) => set({ urgent })} size="field" />
          </div>
          {problem?.field === "deadline" ? (
            <p className="tasks-edit-problem" data-testid="desk-edit-problem">
              {problem.text}
            </p>
          ) : null}
        </div>

        <span className={LABEL}>Подробности</span>
        <GrowArea value={draft.body} onChange={(body) => set({ body })} label="Подробности" placeholder="Можно не писать" maxLength={4000} testId="desk-edit-body" />
      </div>

      {/* the foot rides at the panel's bottom while the fields scroll: who learns of it, and the two buttons */}
      <div className="tasks-edit-foot sticky bottom-0 z-[1] flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[12px] leading-[18px]" aria-live="polite" data-testid={armed ? "desk-edit-armed" : "desk-edit-notice"} data-armed={armed ? "" : undefined}>
          {armed ? (
            <>
              Не сохранено — <Kbd>Esc</Kbd> ещё раз, чтобы выйти без правки
            </>
          ) : (
            notice
          )}
        </p>
        <Button type="button" size="sm" variant="secondary" onClick={() => onDone(false)} data-testid="desk-edit-cancel">
          Отмена
        </Button>
        <Tooltip label="Сохранить" keys={["Ctrl", "Enter"]} side="top">
          <Button type="submit" size="sm" disabled={!plan.changed || Boolean(problem)} data-testid="desk-edit-save">
            Сохранить
          </Button>
        </Tooltip>
      </div>
    </form>
  );
}
