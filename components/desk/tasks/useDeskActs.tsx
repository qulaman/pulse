"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import type { MenuItem } from "@/components/desk/ui/Menu";
import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Popover, type Anchor } from "@/components/desk/ui/Popover";
import { ruleLine } from "@/components/recurrence/RecurrenceSection";
import { allActionsFor } from "@/components/tasks/list/DirectorTaskCard";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { ACT_LABEL, isDangerAction, keyOfAction, rowKeys } from "@/lib/desk/tasks";
import { shortName } from "@/lib/people/names";
import { peopleQuery } from "@/lib/people/queries";
import { useRecurrenceRules, useUpdateRule } from "@/lib/recurrence/queries";
import type { DeskAction } from "@/lib/tasks/desk";
import { reassignNeedsDeadline, type Suggestion, type TimeRequest } from "@/lib/tasks/lifecycle";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { BUTTON, pluralRu, TEXT } from "@/lib/tasks/status-text";

import { DeadlinePicker, PersonPicker, type Picked } from "./Pickers";

/** What waits on a task besides its status (D-128): the open question, a request for time, the suggested colleague. */
export type ActFlags = { question: string | null; request: TimeRequest | null; suggestion: Suggestion | null };

const NO_FLAGS: ActFlags = { question: null, request: null, suggestion: null };

/** Where a press came from: a point or an element to hang the picker from, and the part of the screen to look in first. */
export type ActFrom = { at?: Anchor; scope?: Element | null };

type Ask =
  | { kind: "deadline"; mode: "extend"; ids: string[]; anchor: Anchor; then?: () => void }
  | { kind: "deadline"; mode: "pass" | "reissue"; ids: [string]; anchor: Anchor; person: Picked; note: string }
  | { kind: "people"; mode: "reassign" | "reissue"; ids: [string]; anchor: Anchor }
  | { kind: "rework"; ids: [string] }
  | { kind: "revoke"; ids: string[]; then?: () => void }
  | { kind: "remove"; ids: [string] };

/**
 * The element a move hangs its picker from: a field or a button that says it stands for this
 * task and this move (`data-act-for`, `data-act`), first inside the part that asked (the panel),
 * then anywhere on the screen (the row's own cell), then the row itself. Null — the middle of the
 * window's top.
 */
function anchorFor(taskId: string, action: DeskAction, from: ActFrom | undefined): Anchor {
  if (from?.at) return from.at;
  if (typeof document === "undefined") return null;
  const id = CSS.escape(taskId);
  const wanted = `[data-act-for="${id}"][data-act~="${action}"]`;
  const visible = (el: Element | null | undefined): el is HTMLElement => el instanceof HTMLElement && el.offsetParent !== null;
  const inScope = from?.scope ? [...from.scope.querySelectorAll(wanted)].find(visible) : undefined;
  const anywhere = inScope ?? [...document.querySelectorAll(wanted)].find(visible);
  const row = anywhere ?? [...document.querySelectorAll(`[data-row-key="${id}"]`)].find(visible);
  return row ?? { x: Math.max(16, window.innerWidth / 2 - 160), y: 120 };
}

/**
 * The director's moves on a task at the desk (D-154 wave 3) — the phone's `useDirectorControls`
 * without its sheets: the same actions of `useTaskActions` with the same receipts in words, but
 * what asks before a move asks in the desk's way — a date or a person in a popover hanging from
 * the field or the button that was pressed, a word for the rework and a «sure?» in a small dialog
 * where Enter answers. One hook for the table, «Сегодня», the panel and «Разобрать», so a move
 * cannot mean two things on two screens; the menus («⋯», a right click) are built here too.
 */
export function useDeskActs({
  base,
  tasks,
  flagsOf = () => NO_FLAGS,
  now,
  companyId,
  onReply,
  onOpen,
  afterRemove,
}: {
  base: TaskActions;
  /** every task these moves may be asked about */
  tasks: readonly TaskWithPeople[];
  flagsOf?: (taskId: string) => ActFlags;
  now: Date;
  companyId: string;
  /** «Ответить» (O): the panel with the caret in its answer field */
  onReply: (task: TaskWithPeople) => void;
  /** a task to open — the toasts' «Открыть» of «Передать» and «Выдать снова» */
  onOpen: (taskId: string) => void;
  /** after «Удалить» of the task on screen */
  afterRemove?: (taskId: string) => void;
}) {
  const queryClient = useQueryClient();
  // what asks now, with the tasks it asks about held: a task that leaves the list meanwhile is still the one asked about
  const [ask, setAsk] = useState<(Ask & { held: TaskWithPeople[] }) | null>(null);
  const byId = (id: string) => tasks.find((task) => task.id === id) ?? ask?.held.find((task) => task.id === id) ?? null;
  const open = (next: Ask) => {
    setAsk({ ...next, held: next.ids.map(byId).filter((task): task is TaskWithPeople => task !== null) });
  };
  const close = () => setAsk(null);

  const rules = useRecurrenceRules(tasks.some((task) => task.recurrence_rule_id));
  const updateRule = useUpdateRule();
  const named = (text: string, task: TaskWithPeople) => {
    const who = shortName(task.assignee?.full_name);
    return who ? `${text} · ${who}` : text;
  };

  // the same receipts in words as the phone's (useDirectorControls): «На доработку · Асхат», «Срок: …»;
  // «Принято», «Отозвано», «Удалено» are the mutation's own, with «Отменить» (D-139)
  const actions: TaskActions = {
    ...base,
    transition: (input) => {
      const task = byId(input.taskId);
      base.transition(input);
      if (task && input.toStatus === "rework") toast(named("На доработку", task));
    },
    extend: (input) => {
      base.extend(input);
      toast(input.deadlineIso ? `Срок: ${humanAqtobe(new Date(input.deadlineIso), now)}` : "Теперь без срока");
    },
    reissue: (input) => base.reissue({ ...input, onOpen }),
    reassign: (input) => base.reassign({ ...input, onOpen }),
  };

  const reassignTo = (task: TaskWithPeople, person: Picked, note: string, anchor: Anchor) => {
    // a deadline already behind (or all but gone) would reach the new person late at birth (D-128)
    if (reassignNeedsDeadline(task.deadline, new Date())) {
      open({ kind: "deadline", mode: "pass", ids: [task.id], anchor, person, note });
      return;
    }
    close();
    actions.reassign({ taskId: task.id, assigneeId: person.id, assigneeName: person.full_name, note: note || undefined });
  };
  const reissueTo = (task: TaskWithPeople, person: Picked, anchor: Anchor) => {
    if (reassignNeedsDeadline(task.deadline, new Date())) {
      open({ kind: "deadline", mode: "reissue", ids: [task.id], anchor, person, note: "" });
      return;
    }
    close();
    actions.reissue({ task, assigneeId: person.id, assigneeName: person.full_name, deadlineIso: task.deadline });
  };

  const answer = (task: TaskWithPeople, text: string, deadlineIso?: string) => {
    // «Когда срок?» — «Завтра 12:00»: the date goes on the task too, quietly (D-142)
    if (deadlineIso) base.extend({ taskId: task.id, deadlineIso });
    actions.sendMessage({ taskId: task.id, companyId, text });
    toast(named("Ответ ушёл", task));
  };

  const press = (action: DeskAction | "reply", task: TaskWithPeople, from?: ActFrom) => {
    switch (action) {
      case "reply":
      case "answer":
        onReply(task);
        return;
      case "approve":
        actions.transition({ taskId: task.id, toStatus: "done" });
        return;
      case "insist":
        actions.transition({ taskId: task.id, toStatus: "sent" });
        return;
      case "grant":
      case "keep": {
        const request = flagsOf(task.id).request;
        actions.answerTime({ taskId: task.id, approve: action === "grant", proposedIso: request?.proposed ?? null });
        toast(named(action === "grant" ? "Срок согласован" : "Срок прежний", task));
        return;
      }
      case "nudge":
        actions.nudge({ taskId: task.id, name: shortName(task.assignee?.full_name) });
        return;
      case "sendNow":
        actions.sendNow(task.id);
        return;
      case "open":
        onOpen(task.id);
        return;
      case "extend":
      case "retime":
        open({ kind: "deadline", mode: "extend", ids: [task.id], anchor: anchorFor(task.id, "extend", from) });
        return;
      case "reassign":
        open({ kind: "people", mode: "reassign", ids: [task.id], anchor: anchorFor(task.id, "reassign", from) });
        return;
      case "handoff": {
        const suggestion = flagsOf(task.id).suggestion;
        const anchor = anchorFor(task.id, "reassign", from);
        if (!suggestion) open({ kind: "people", mode: "reassign", ids: [task.id], anchor });
        else reassignTo(task, { id: suggestion.id, full_name: suggestion.name }, "", anchor);
        return;
      }
      case "reissue": {
        const anchor = anchorFor(task.id, "reissue", from);
        // the same person only while he still works here — else the picker first (D-139)
        void queryClient
          .ensureQueryData(peopleQuery)
          .catch(() => null)
          .then((people) => {
            const left = people ? !people.some((person) => person.id === task.assignee_id && person.is_active) : false;
            if (!task.assignee_id || !task.assignee?.full_name || left) {
              open({ kind: "people", mode: "reissue", ids: [task.id], anchor });
              return;
            }
            reissueTo(task, { id: task.assignee_id, full_name: task.assignee.full_name }, anchor);
          });
        return;
      }
      case "rework":
        open({ kind: "rework", ids: [task.id] });
        return;
      case "cancel":
      case "revoke":
        open({ kind: "revoke", ids: [task.id] });
        return;
      case "remove":
        open({ kind: "remove", ids: [task.id] });
        return;
    }
  };

  /**
   * Everything the task allows, as a menu — «⋯», «Ещё» and a right click say the same list: the
   * phone's «Действия» (`allActionsFor`), each with the letter that does it where there is one,
   * the repeat's switch (D-148), the link, and the moves that take it away last, in red.
   */
  const menu = (task: TaskWithPeople, { onOpenRow, extra = [] }: { onOpenRow?: () => void; extra?: MenuItem[] } = {}): MenuItem[] => {
    const flags = flagsOf(task.id);
    const keys = rowKeys(task, { request: Boolean(flags.request) });
    const all = allActionsFor(task, { request: Boolean(flags.request), suggestion: Boolean(task.status === "declined" && flags.suggestion) });
    const item = (action: DeskAction): MenuItem => ({
      key: action,
      label: action === "handoff" && flags.suggestion ? `Передать · ${shortName(flags.suggestion.name)}` : ACT_LABEL[action],
      hint: keyOfAction(action, keys),
      danger: isDangerAction(action),
      onSelect: () => press(action, task),
    });
    const items: MenuItem[] = [];
    if (onOpenRow) items.push({ key: "open-row", label: "Открыть", hint: "Enter", onSelect: onOpenRow });
    if (task.status !== "revoked") items.push({ key: "reply", label: flags.question ? "Ответить на вопрос" : "Написать в переписку", hint: keyOfAction("reply", keys), onSelect: () => onReply(task) });
    const moves = all.filter((action) => !isDangerAction(action));
    if (items.length > 0 && moves.length > 0) items.push("separator");
    items.push(...moves.map(item));
    const rule = task.recurrence_rule_id ? (rules.data?.find((one) => one.id === task.recurrence_rule_id) ?? null) : null;
    const tail: MenuItem[] = [...extra];
    if (rule) {
      tail.push({
        key: "rule",
        label: rule.is_active ? `Остановить повтор · ${ruleLine(rule)}` : `Возобновить повтор · ${ruleLine(rule)}`,
        onSelect: () =>
          updateRule.mutate({ id: rule.id, patch: { is_active: !rule.is_active }, toast: rule.is_active ? "Повтор остановлен. Эта задача остаётся" : "Повтор снова работает" }),
      });
    }
    tail.push({
      key: "link",
      label: "Скопировать ссылку",
      onSelect: () => {
        // the phone's address: on a computer it opens this panel, on a phone the task's screen (D-153 §2)
        void navigator.clipboard?.writeText(`${window.location.origin}/tasks/${task.id}`).then(
          () => toast("Ссылка скопирована"),
          () => toast("Не смог скопировать ссылку"),
        );
      },
    });
    items.push("separator", ...tail);
    const away = all.filter(isDangerAction);
    if (away.length > 0) items.push("separator", ...away.map(item));
    return items;
  };

  /* ---- many rows at once: the table's bar (принцип 3 — nothing here accepts) ---- */
  const bulk = {
    nudge: (list: readonly TaskWithPeople[]) => {
      for (const task of list) actions.nudge({ taskId: task.id, name: shortName(task.assignee?.full_name) });
    },
    /** `then` — after the date is set (the marks go), not when the picker is closed with nothing */
    extend: (list: readonly TaskWithPeople[], anchor: Anchor, then?: () => void) => {
      if (list.length > 0) open({ kind: "deadline", mode: "extend", ids: list.map((task) => task.id), anchor, then });
    },
    revoke: (list: readonly TaskWithPeople[], then?: () => void) => {
      if (list.length > 0) open({ kind: "revoke", ids: list.map((task) => task.id), then });
    },
  };

  /* ---- what asks ---- */
  const first = ask ? byId(ask.ids[0]) : null;
  const count = ask?.ids.length ?? 0;
  let node: ReactNode = null;
  if (ask && first) {
    if (ask.kind === "deadline") {
      const many = ask.mode === "extend" && count > 1;
      const who = ask.mode === "extend" ? null : shortName(ask.person.full_name);
      node = (
        <Popover key={`${ask.kind}:${ask.mode}`} open onClose={close} anchor={ask.anchor} width={300} label="Срок">
          <DeadlinePicker
            title={many ? `Новый срок · ${count} ${pluralRu(count, ["задача", "задачи", "задач"])}` : who ? `Срок для: ${who}` : "Срок"}
            hint={
              ask.mode !== "extend" && first.deadline
                ? new Date(first.deadline).getTime() < now.getTime()
                  ? `Прежний срок прошёл: ${humanAqtobe(new Date(first.deadline), now)}`
                  : `До прежнего срока меньше часа: ${humanAqtobe(new Date(first.deadline), now)}`
                : many
                  ? "Каждой отмеченной задаче — один и тот же"
                  : null
            }
            currentIso={many || ask.mode !== "extend" ? null : first.deadline}
            now={now}
            none={ask.mode === "extend"}
            onPick={(iso) => {
              close();
              if (ask.mode === "pass") {
                actions.reassign({ taskId: first.id, assigneeId: ask.person.id, assigneeName: ask.person.full_name, changeDeadline: true, deadlineIso: iso, note: ask.note || undefined });
              } else if (ask.mode === "reissue") {
                actions.reissue({ task: first, assigneeId: ask.person.id, assigneeName: ask.person.full_name, deadlineIso: iso });
              } else if (many) {
                for (const id of ask.ids) base.extend({ taskId: id, deadlineIso: iso });
                toast(`${iso ? `Срок: ${humanAqtobe(new Date(iso), now)}` : "Без срока"} · ${count} ${pluralRu(count, ["задача", "задачи", "задач"])}`);
                ask.then?.();
              } else {
                actions.extend({ taskId: first.id, deadlineIso: iso });
              }
            }}
          />
        </Popover>
      );
    } else if (ask.kind === "people") {
      const suggestion = ask.mode === "reassign" && first.status === "declined" ? flagsOf(first.id).suggestion : null;
      node = (
        <Popover key={`${ask.kind}:${ask.mode}`} open onClose={close} anchor={ask.anchor} width={320} label="Кому">
          <PersonPicker
            title={ask.mode === "reassign" ? "Кому передать?" : "Кому выдать?"}
            subject={first.title}
            currentId={ask.mode === "reassign" ? first.assignee_id : null}
            suggestedIds={suggestion ? [suggestion.id] : []}
            withNote={ask.mode === "reassign"}
            onPick={(person, note) => (ask.mode === "reassign" ? reassignTo(first, person, note, ask.anchor) : reissueTo(first, person, ask.anchor))}
          />
        </Popover>
      );
    } else if (ask.kind === "rework") {
      node = <ReworkDialog key={first.id} task={first} onClose={close} onSubmit={(comment) => actions.transition({ taskId: first.id, toStatus: "rework", comment })} />;
    } else {
      const remove = ask.kind === "remove";
      node = (
        <Dialog open onClose={close} title={remove ? BUTTON.remove : count > 1 ? `Отозвать ${count} ${pluralRu(count, ["задачу", "задачи", "задач"])}` : BUTTON.revoke} width="sm">
          <p className="text-[14px] leading-5 text-muted">
            {remove ? TEXT.removeConfirm : count > 1 ? "Каждая уйдёт с пометкой «отозвано директором». Отменить можно сразу — в уведомлении." : TEXT.revokeConfirm}
          </p>
          {count === 1 ? <p className="mt-2 line-clamp-2 text-[14px] font-medium leading-5">«{first.title}»</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={close}>
              Не сейчас
            </Button>
            <Button
              size="sm"
              variant="danger"
              data-autofocus
              data-testid="desk-confirm-danger"
              onClick={() => {
                close();
                for (const id of ask.ids) {
                  if (remove) actions.remove(id);
                  else actions.revoke(id);
                }
                if (remove) afterRemove?.(first.id);
                else ask.then?.();
              }}
            >
              {remove ? BUTTON.remove : BUTTON.revoke}
              <span aria-hidden className="text-[11px] opacity-70">
                ⏎
              </span>
            </Button>
          </div>
        </Dialog>
      );
    }
  }

  return { actions, press, answer, menu, bulk, node, asking: ask !== null };
}

export type DeskActs = ReturnType<typeof useDeskActs>;

/** Esc twice within this to drop what was typed (В-12 з). */
const ESC_ARM_MS = 4000;

/**
 * «Что доработать?» — the comment the employee will read in the thread; Enter sends, Shift+Enter
 * breaks the line. Words in the field are not lost to one Esc, a click outside or «×»: the first
 * says so, the second closes — the desk's forms' way (В-12 з). «Не сейчас» is said on purpose.
 */
function ReworkDialog({ task, onClose, onSubmit }: { task: TaskWithPeople; onClose: () => void; onSubmit: (comment: string) => void }) {
  const [text, setText] = useState("");
  const [armed, setArmed] = useState(false);
  const askClose = () => {
    if (text.trim() && !armed) {
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
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onClose();
    onSubmit(value);
  };
  return (
    <Dialog open onClose={askClose} title={TEXT.reworkTitle} width="md">
      <p className="-mt-1 mb-3 line-clamp-1 text-[13px] leading-4 text-muted">
        {shortName(task.assignee?.full_name)} · «{task.title}»
      </p>
      <textarea
        data-autofocus
        rows={4}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setArmed(false);
        }}
        onKeyDown={(event) => {
          if ((event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={TEXT.reworkPlaceholder}
        className="field no-bar w-full resize-none px-3 py-2.5 text-[14px] leading-5 outline-none placeholder:text-muted focus:border-accent"
        data-testid="desk-rework-text"
      />
      <div className="mt-3 flex items-center justify-end gap-2">
        {armed ? (
          <span className="mr-auto text-[12px] leading-4" style={{ color: "var(--warn)" }} aria-live="polite" data-testid="desk-rework-armed">
            Не отправлено — <Kbd>Esc</Kbd> ещё раз, чтобы закрыть
          </span>
        ) : (
          <span className="mr-auto text-[12px] leading-4 text-muted">Enter — отправить · Shift+Enter — новая строка</span>
        )}
        <Button size="sm" variant="secondary" onClick={onClose}>
          Не сейчас
        </Button>
        <Button size="sm" disabled={!text.trim()} onClick={submit}>
          На доработку
        </Button>
      </div>
    </Dialog>
  );
}
