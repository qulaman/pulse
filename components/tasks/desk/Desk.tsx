"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { RECEIPT_COLOR } from "@/components/tasks/DeliveryStatus";
import { Body, Gauge, Key, Lcd, LcdDim, Lens, type LedTone } from "@/components/ui/device/Device";
import { humanAqtobe } from "@/lib/ai/time";
import { haptic } from "@/lib/haptics";
import { isNetworkError, NetworkError } from "@/lib/net";
import type { BoardTask } from "@/lib/pulse/board";
import type { Database } from "@/lib/supabase/types";
import {
  deskSummary,
  keysFor,
  nextSelection,
  reasonOf,
  receiptText,
  type DeskAction,
  type DeskItem,
  type DeskReason,
} from "@/lib/tasks/desk";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { Me, TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, SHORT_STATUS } from "@/lib/tasks/status-text";
import { tvTime } from "@/lib/tv/clock";

import { AnswerSheet } from "./AnswerSheet";
import { DeskKeys } from "./DeskKeys";
import { DirectorSheets, type DirectorSheetName } from "./DirectorSheets";
import { Icon } from "./icons";

/**
 * The head of «Задачи», read as a device (D-80): eyes on the display, the thumb under it.
 * The display says whose move it is and shows one task; the three keys under it are that
 * task's commands; the lens is the receipt of the last one. Built from the device kit of
 * the TV remote — the same hardware rules: static shadows, transform-only motion, the
 * LED blink as the only animation.
 *
 * The head sticks under the app header and folds to one line of display plus the keys
 * once the list scrolls under it. The fold keeps the page's height: what the head gives
 * up is handed to a spacer below it, so the list does not jump (DESIGN §1.6).
 */

type Delivery = Database["public"]["Tables"]["notification_deliveries"]["Row"];

/** The receipt of the director's own command, on the display's second line for three seconds. */
export type Flash = { taskId: string; text: string; tone: "ok" | "warn"; queue: readonly string[] };

const FLASH_MS = 3_000;

const REASON_WORD: Record<DeskReason, string> = {
  review: "Ваш ход · приёмка",
  question: "Ваш ход · вопрос",
  declined: "Отказ",
  overdue: "Просрочено",
};

const SUMMARY_COLOR = { ok: "var(--ok)", warn: "var(--warn)", danger: "var(--danger)" } as const;

const EYEBROW = "font-display text-[11px] font-semibold uppercase leading-4 tracking-[0.1em]";

function firstName(full: string | null | undefined): string {
  return full?.trim().split(/\s+/)[0] ?? "";
}

/** The clock on the display and the gauge melt on their own: every 10 s is enough. */
function useTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/* -------------------------------------------------------------------------- */
/* Selection and receipts                                                      */
/* -------------------------------------------------------------------------- */

type Pending = { taskId: string; text: string; queue: readonly string[] };

/**
 * What the display holds and what it says about the last command. The first task of the
 * queue is picked when the data arrives; a task that leaves the queue hands the display
 * to the next one — after its receipt has been shown, so «Принято · Асхат» stands next
 * to Асхат's task, not the next person's.
 *
 * The mutations are the existing ones (`useTaskActions`): the desk only wraps them to
 * know which receipt to expect, and listens to the mutation cache for the outcome.
 */
export function useDesk({ tasks, queue, ready }: { tasks: readonly TaskWithPeople[]; queue: readonly DeskItem[]; ready: boolean }) {
  const queryClient = useQueryClient();
  const queueIds = useMemo(() => queue.map((item) => item.task.id), [queue]);
  const queueKey = queueIds.join(",");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seenKey, setSeenKey] = useState<string | null>(null);
  const [prevIds, setPrevIds] = useState<readonly string[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);
  // the task whose command is in flight: the optimistic patch moves it out of the queue
  // before the server answers, and the display must wait for the answer on that task
  const [awaiting, setAwaiting] = useState<string | null>(null);

  const exists = (id: string) => tasks.some((task) => task.id === id);

  // the queue changed: adjust the pick during render (no effect, no second paint)
  if (ready && queueKey !== seenKey) {
    setSeenKey(queueKey);
    setPrevIds(queueIds);
    if (seenKey === null) setSelectedId(queueIds[0] ?? null);
    else if (!(selectedId && (selectedId === awaiting || selectedId === flash?.taskId) && exists(selectedId))) {
      setSelectedId(nextSelection(selectedId, prevIds, queueIds, exists));
    }
  }

  const live = useRef({ queueIds, tasks });
  useEffect(() => {
    live.current = { queueIds, tasks };
  });

  const pending = useRef<Pending | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show = (next: Flash) => {
      if (timer.current) clearTimeout(timer.current);
      setFlash(next);
      timer.current = setTimeout(() => {
        setFlash(null);
        // the receipt has been read: the display moves on if its task left the queue
        const { queueIds: now, tasks: all } = live.current;
        setSelectedId((current) =>
          current === next.taskId ? nextSelection(current, next.queue, now, (id) => all.some((task) => task.id === id)) : current,
        );
      }, FLASH_MS);
    };

    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      const expected = pending.current;
      if (!expected || event.type !== "updated") return;
      const { status, variables, error } = event.mutation.state;
      const vars = variables as { taskId?: string; seq?: number } | undefined;
      // the read cursor is not a command
      if (!vars || vars.taskId !== expected.taskId || "seq" in vars) return;
      if (status === "success") {
        pending.current = null;
        setAwaiting(null);
        show({ taskId: expected.taskId, text: expected.text, tone: "ok", queue: expected.queue });
      } else if (status === "error") {
        pending.current = null;
        setAwaiting(null);
        const offline = error instanceof NetworkError || isNetworkError(error);
        show({
          taskId: expected.taskId,
          text: offline ? "Нет связи · отправлю, как появится" : "Не отправилось · повтори",
          tone: "warn",
          queue: expected.queue,
        });
      }
    });
    return () => {
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [queryClient]);

  const expect = (taskId: string, text: string) => {
    pending.current = { taskId, text, queue: live.current.queueIds };
    setAwaiting(taskId);
  };

  /** The same actions, each announcing the receipt it should end with. */
  const wrap = (base: TaskActions): TaskActions => {
    const who = (taskId: string) => firstName(live.current.tasks.find((task) => task.id === taskId)?.assignee?.full_name);
    const named = (text: string, taskId: string) => (who(taskId) ? `${text} · ${who(taskId)}` : text);
    return {
      ...base,
      transition: (input) => {
        const text = input.toStatus === "done" ? "Принято" : input.toStatus === "rework" ? "На доработку" : "Снова отправлено";
        expect(input.taskId, named(text, input.taskId));
        base.transition(input);
      },
      extend: (input) => {
        expect(input.taskId, input.deadlineIso ? `Продлено до ${humanAqtobe(new Date(input.deadlineIso))}` : "Теперь без срока");
        base.extend(input);
      },
      reassign: (input) => {
        expect(input.taskId, `Передано · ${firstName(input.assigneeName)}`);
        base.reassign(input);
      },
      revoke: (taskId) => {
        expect(taskId, "Отозвано");
        base.revoke(taskId);
      },
      remove: (taskId) => {
        expect(taskId, "Удалено");
        base.remove(taskId);
      },
      sendMessage: (input) => {
        expect(input.taskId, named("Ответ ушёл", input.taskId));
        base.sendMessage(input);
      },
    };
  };

  return {
    selectedId: selectedId && exists(selectedId) ? selectedId : null,
    select: setSelectedId,
    flash,
    wrap,
  };
}

/* -------------------------------------------------------------------------- */
/* Fold: the head sticks under the app header and shrinks once scrolled        */
/* -------------------------------------------------------------------------- */

function useFold() {
  const sentinel = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const fullHeight = useRef(0);
  const [top, setTop] = useState(0);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const header = document.querySelector("header");
    const measure = () => setTop(header ? header.getBoundingClientRect().height : 0);
    measure();
    const resize = header ? new ResizeObserver(measure) : null;
    if (header) resize?.observe(header);
    return () => resize?.disconnect();
  }, []);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), {
      rootMargin: `-${Math.round(top)}px 0px 0px 0px`,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [top]);

  // the full head's height is the page's; the folded head hands the difference to the spacer
  useLayoutEffect(() => {
    if (!head.current || !spacer.current) return;
    if (!compact) {
      fullHeight.current = head.current.offsetHeight;
      spacer.current.style.height = "0px";
    } else {
      spacer.current.style.height = `${Math.max(0, fullHeight.current - head.current.offsetHeight)}px`;
    }
  });

  return { sentinel, head, spacer, top, compact };
}

/* -------------------------------------------------------------------------- */

export function Desk({
  me,
  tasks,
  board,
  queue,
  selectedId,
  onSelect,
  flash,
  delivery,
  actions,
  children,
}: {
  me: Me;
  /** Everything the director handed out — the list below and the summary. */
  tasks: readonly TaskWithPeople[];
  /** Open tasks with their question, reason and last word; closed tasks have no row. */
  board: ReadonlyMap<string, BoardTask>;
  queue: readonly DeskItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  flash: Flash | null;
  delivery: Delivery | null | undefined;
  /** Already wrapped by `useDesk` so the receipts arrive. */
  actions: TaskActions;
  /** Keys below the command keys (filters): folded away with the lens. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const now = useTick();
  const { sentinel, head, spacer, top, compact } = useFold();
  const [sheet, setSheet] = useState<{ name: DirectorSheetName | "answer"; taskId: string } | null>(null);

  const task = selectedId ? (tasks.find((t) => t.id === selectedId) ?? null) : null;
  const row = task ? (board.get(task.id) ?? null) : null;
  const position = task ? queue.findIndex((item) => item.task.id === task.id) : -1;
  const overdue = task ? isOverdue(task, now) : false;
  const reason = row ? reasonOf(row, now) : null;
  const keys: DeskAction[] = task ? keysFor(task, { question: Boolean(row?.question), overdue }) : [];
  const summary = deskSummary(tasks, queue, now);

  const led: LedTone = actions.busy
    ? "accent"
    : flash
      ? flash.tone
      : summary.tone === "danger"
        ? "danger"
        : queue.length > 0
          ? "warn"
          : "ok";

  const press = (action: DeskAction) => {
    if (!task) return;
    switch (action) {
      case "approve":
        haptic(15);
        actions.transition({ taskId: task.id, toStatus: "done" });
        return;
      case "insist":
        actions.transition({ taskId: task.id, toStatus: "sent" });
        return;
      case "open":
        router.push(`/tasks/${task.id}`);
        return;
      case "answer":
        setSheet({ name: "answer", taskId: task.id });
        return;
      case "cancel":
        setSheet({ name: "revoke", taskId: task.id });
        return;
      case "remove":
        setSheet({ name: "delete", taskId: task.id });
        return;
      default:
        setSheet({ name: action, taskId: task.id });
    }
  };

  const step = (by: number) => {
    const next = queue[position + by] ?? (position < 0 && by > 0 ? queue[0] : undefined);
    if (next) onSelect(next.task.id);
  };

  // the second line: the receipt of my own command, else the push receipt of the task
  const delivered = row && delivery && task && task.status !== "scheduled" ? receiptText(delivery, task.status, now) : null;
  const second = flash
    ? { text: flash.text, color: flash.tone === "ok" ? "var(--ok)" : "var(--warn)" }
    : delivered
      ? { text: delivered.text, color: RECEIPT_COLOR[delivered.tone] }
      : null;

  const who = (id: string) => (id === me.userId ? "Вы" : id === task?.assignee_id ? firstName(task?.assignee?.full_name) : "");
  const last = row?.last_message ?? null;
  const lastText = last
    ? last.type === "photo"
      ? `фото${last.content ? `: ${last.content}` : ""}`
      : last.type === "voice"
        ? `голосовое${last.content ? `: ${last.content}` : ""}`
        : (last.content ?? "")
    : "";
  const quote = row?.question
    ? { text: `«${row.question}»`, color: "var(--warn)" }
    : last && lastText
      ? { text: who(last.sender_id) ? `${who(last.sender_id)}: ${lastText}` : lastText, color: undefined }
      : null;

  const deadline = task?.deadline ? new Date(task.deadline) : null;
  const gauge =
    task && deadline && deadline.getTime() > now.getTime()
      ? (deadline.getTime() - now.getTime()) / Math.max(1, deadline.getTime() - new Date(task.created_at).getTime())
      : null;

  const sheetTask = sheet ? (tasks.find((t) => t.id === sheet.taskId) ?? null) : null;
  const sheetRow = sheetTask ? (board.get(sheetTask.id) ?? null) : null;

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px" />
      <div ref={head} className="sticky z-20 -mx-4 bg-bg px-4 pb-3" style={{ top: top }}>
        <Body className="mx-auto w-full max-w-[380px]">
          {compact ? null : <Lens tone={led} blink={actions.busy} />}

          <div data-testid="desk-lcd" className={compact ? "" : "mt-3"}>
            <Lcd>
              {compact ? (
                <p className="truncate font-display text-[15px] font-semibold leading-5 tracking-[-0.01em]" style={flash ? { color: second?.color } : undefined}>
                  {flash ? flash.text : task ? task.title : summary.headline}
                </p>
              ) : task ? (
                <div className="min-h-[155px]">
                  <div className="flex items-center justify-between gap-3">
                    <LcdDim className={`${EYEBROW} truncate`}>{reason ? REASON_WORD[reason] : SHORT_STATUS[task.status]}</LcdDim>
                    <LcdDim className="nums shrink-0 text-[12px] leading-4">
                      {position >= 0 ? `${position + 1} / ${queue.length}` : tvTime(now)}
                    </LcdDim>
                  </div>
                  <p className="mt-2 line-clamp-3 min-h-12 font-display text-[19px] font-bold leading-6 tracking-[-0.02em]">{task.title}</p>
                  <p className="mt-1.5 truncate text-[13px] leading-[18px]">
                    <LcdDim>{task.assignee?.full_name ?? "без исполнителя"} · </LcdDim>
                    <span style={overdue ? { color: "var(--danger)" } : undefined}>
                      {deadline ? humanAqtobe(deadline, now) : "без срока"}
                    </span>
                  </p>
                  <p className="mt-1 h-[18px] truncate text-[13px] leading-[18px]" style={second ? { color: second.color } : undefined}>
                    {second?.text ?? ""}
                  </p>
                  <p className="mt-1 h-[18px] truncate text-[13px] leading-[18px]" style={quote?.color ? { color: quote.color } : undefined}>
                    {quote?.text ?? ""}
                  </p>
                  <div className={`mt-3 ${gauge === null ? "invisible" : ""}`}>
                    <Gauge ratio={gauge ?? 0} />
                  </div>
                </div>
              ) : (
                <div className="min-h-[155px]">
                  <div className="flex items-center justify-between gap-3">
                    <LcdDim className={EYEBROW}>Задачи</LcdDim>
                    <LcdDim className="nums text-[12px] leading-4">{tvTime(now)}</LcdDim>
                  </div>
                  <p className="mt-2 truncate font-display text-[28px] font-bold leading-[34px] tracking-[-0.02em]">{summary.headline}</p>
                  <p className="mt-1 text-[13px] leading-[18px]" style={{ color: flash ? second?.color : SUMMARY_COLOR[summary.tone] }}>
                    {flash ? flash.text : summary.line}
                  </p>
                </div>
              )}
            </Lcd>
          </div>

          {!compact && queue.length >= 2 ? (
            <div className="mt-3 flex justify-end gap-2">
              <Key round icon={<Icon name="left" size={20} />} aria-label="Предыдущая в очереди" disabled={position <= 0} onClick={() => step(-1)} />
              <Key
                round
                icon={<Icon name="right" size={20} />}
                aria-label="Следующая в очереди"
                disabled={position >= queue.length - 1}
                onClick={() => step(1)}
              />
            </div>
          ) : null}

          <div className="mt-3">
            <DeskKeys keys={keys} disabled={!task} onPress={press} />
          </div>

          {compact ? null : children}
        </Body>
      </div>
      <div ref={spacer} aria-hidden />

      {sheetTask ? (
        <DirectorSheets
          task={sheetTask}
          open={sheet && sheet.name !== "answer" ? sheet.name : null}
          onClose={() => setSheet(null)}
          actions={actions}
        />
      ) : null}
      {sheetTask && sheetRow?.question ? (
        <AnswerSheet
          open={sheet?.name === "answer"}
          onClose={() => setSheet(null)}
          taskId={sheetTask.id}
          companyId={me.companyId}
          question={sheetRow.question}
          actions={actions}
        />
      ) : null}
    </>
  );
}
