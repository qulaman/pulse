"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { receiptLine, useThreadReceipt } from "@/lib/tasks/receipts";
import type { TaskActions } from "@/lib/tasks/mutations";
import { fetchEarlierMessages, isPendingMessage, prependMessages, THREAD_PAGE, type TaskMessage } from "@/lib/tasks/queries";
import { dayLabel, messageState, startsNewDay, withoutPassedRevoke } from "@/lib/tasks/thread";
import { useDockSpace } from "@/components/ui/dock";
import { onKeyboard, readKeyboard, useKeyboardDock } from "@/lib/ui/keyboard";
import { Composer } from "./Composer";
import { DaySeparator } from "./DaySeparator";
import { MessageRow } from "./MessageRow";
import { SystemRow } from "./SystemRow";

const RECEIPT_TONE = { ok: "var(--ok)", warn: "var(--warn)", muted: "var(--text-muted)" } as const;
/** The last word stands this far above the field. */
const END_GAP = 12;
/** The keyboard has stopped sliding and the browser has stopped scrolling for it. */
const KEYBOARD_SETTLE_MS = 150;

export type ThreadViewProps = {
  taskId: string;
  companyId: string;
  messages: TaskMessage[] | undefined;
  loading: boolean;
  userId: string | undefined;
  actions: TaskActions;
  /** Receipts are the director's (принцип 8); the employee sees no ticks (D-64 §6). */
  isDirector?: boolean;
  /** Inside a sheet: the composer is part of the flow, not fixed to the window. */
  compact?: boolean;
  /** A line in place of the composer: the thread is over (a recalled task, D-142). */
  closedNote?: string | null;
};

/**
 * The thread as one feed: words, photos, voice and the order's own history in the same
 * scroll, separated by days. The tail loads first (THREAD_PAGE messages) and «Показать
 * раньше» walks back a page at a time — a year-old task must open as fast as a new one.
 */
export function ThreadView({ taskId, companyId, messages, loading, userId, actions, isDirector = false, compact = false, closedNote = null }: ThreadViewProps) {
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const section = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  // the composer docked over the tab bar says how tall it is (--dock-space): the thread ends above
  // it — the last line used to sit under the field — and the bottom toasts stand over it (D-143)
  const dock = useRef<HTMLDivElement>(null);
  useDockSpace(dock, !compact && !closedNote);
  // and it stands on the keyboard when the keyboard is out (D-60: nothing hides the field), the
  // thread's tail growing by the keyboard so its last word can still scroll up above the field
  useKeyboardDock(dock, !compact && !closedNote, { page: section });
  const queryClient = useQueryClient();

  const receipt = useThreadReceipt(taskId, isDirector, userId);
  const line = isDirector ? receiptLine(receipt.data) : null;

  // a handed-over task tells «передана» once, not «отозвано» beside it (D-128)
  const rows = useMemo(() => withoutPassedRevoke(messages ?? []), [messages]);
  // one receipt, under the last word that is mine — a tick per bubble would be noise
  const lastMine = [...rows].reverse().find((message) => message.sender_id === userId && !isPendingMessage(message));

  const scrollToEnd = useCallback(() => {
    if (compact) {
      // the sheet is its own scroller: the window, and the browser's scroll for the keyboard, stay out of it
      const list = section.current;
      if (list) list.scrollTop = list.scrollHeight;
      return;
    }
    const end = bottom.current;
    const field = dock.current;
    if (!end) return;
    if (!field) {
      end.scrollIntoView({ block: "end" });
      return;
    }
    // the last word ends just above the field, wherever the field stands — over the tab bar or
    // on the keyboard; only ever down: a last word already in sight stays where the reader has it
    const hidden = end.getBoundingClientRect().bottom - (field.getBoundingClientRect().top - END_GAP);
    if (hidden > 1) window.scrollBy(0, hidden);
  }, [compact]);

  // The thread follows its end while new words arrive. In a sheet it also opens there — the
  // sheet is its own scroller. On the task's screen the thread is part of the page, and the
  // page opens at its top, status first: scrolling the window the moment the messages landed
  // threw the whole screen up under the finger (D-122).
  const count = rows.length;
  const settled = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return;
    if (settled.current === null) {
      settled.current = count;
      if (compact && count > 0) scrollToEnd();
      return;
    }
    if (count > settled.current) scrollToEnd();
    settled.current = count;
  }, [count, loading, compact, scrollToEnd]);
  // The keyboard takes half the screen: once it is out and the browser has stopped scrolling to
  // show the field, the last word moves up above the field. Once per keyboard, not on every move
  // of the viewport — the page and the browser took turns scrolling and the screen shook (2026-10-22).
  useEffect(() => {
    if (closedNote) return;
    let up = readKeyboard().up;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = onKeyboard((keyboard) => {
      if (keyboard.up && !up) pending = true;
      up = keyboard.up;
      clearTimeout(timer);
      if (!up) pending = false;
      if (!pending) return;
      timer = setTimeout(() => {
        pending = false;
        scrollToEnd();
      }, KEYBOARD_SETTLE_MS);
    });
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [closedNote, scrollToEnd]);

  const showEarlier = async () => {
    const oldest = rows.find((message) => !isPendingMessage(message));
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const page = await fetchEarlierMessages(taskId, oldest.seq);
      if (page.length < THREAD_PAGE) setHasMore(false);
      if (page.length > 0) {
        prependMessages(queryClient, taskId, page);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const retry = (message: TaskMessage) => {
    actions.sendMessage({
      taskId,
      companyId,
      text: message.content ?? "",
      filePath: message.file_path,
      type: message.type as "text" | "photo" | "voice",
      id: message.id,
    });
  };

  return (
    <>
      <section
        ref={section}
        className={compact ? "no-bar flex flex-1 flex-col overflow-y-auto px-1 pb-2" : "mt-4"}
        style={
          compact || closedNote
            ? undefined
            : // the keyboard's room less the tab bar's, which stepped away for it
              { paddingBottom: "calc(var(--dock-space, 0px) + var(--tabbar-space) + 12px + max(0px, var(--kb-room, 0px) - var(--tabbar-space)))" }
        }
        data-testid="thread"
      >
        {rows.length >= THREAD_PAGE && hasMore ? (
          <button
            type="button"
            onClick={() => void showEarlier()}
            disabled={loadingMore}
            className="mx-auto mb-2 block min-h-[36px] rounded-full border border-border px-4 text-[13px] leading-4 text-muted"
          >
            {loadingMore ? "Загружаю…" : "Показать раньше"}
          </button>
        ) : null}

        {/* a short thread sits on the composer, like every messenger; a long one scrolls */}
        <div className={`flex flex-col gap-2 ${compact ? "mt-auto" : ""}`}>
          {loading && rows.length === 0 ? (
            <p className="text-[14px] leading-[18px] text-muted">Загружаю переписку…</p>
          ) : rows.length === 0 ? (
            <p className="text-[14px] leading-[18px] text-muted">Сообщений пока нет. Вопрос, отчёт или голосовое — сюда</p>
          ) : (
            rows.map((message, index) => {
              const system = message.type === "status_change" || message.type === "system";
              return (
                <div key={message.id}>
                  {startsNewDay(rows[index - 1], message) ? <DaySeparator label={dayLabel(message.created_at)} /> : null}
                  {system ? (
                    <SystemRow message={message} />
                  ) : (
                    <MessageRow message={message} mine={message.sender_id === userId} onRetry={retry} />
                  )}
                  {line && lastMine?.id === message.id && messageState(message) === "sent" ? (
                    <p className="mt-1 pr-1 text-right text-[12px] leading-4" style={{ color: RECEIPT_TONE[line.tone] }} data-testid="thread-receipt">
                      {line.text}
                      {/* at night the words wait for the morning — unless the director says «now» (D-129) */}
                      {line.held ? (
                        <>
                          {" · "}
                          <button
                            type="button"
                            className="underline underline-offset-2"
                            style={{ color: "var(--accent)" }}
                            onClick={() => actions.sendNow(taskId)}
                            data-testid="thread-send-now"
                          >
                            отправить сейчас
                          </button>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
          <div ref={bottom} />
        </div>
      </section>

      {closedNote ? (
        <p
          className="mt-2 px-1 text-center text-[13px] leading-4 text-muted"
          // the last line of the screen: it clears the tab bar itself
          style={compact ? undefined : { paddingBottom: "calc(var(--tabbar-space) + 16px)" }}
          data-testid="thread-closed"
        >
          {closedNote}
        </p>
      ) : compact ? (
        <div className="border-t border-border bg-bg px-1 pt-2">
          <Composer taskId={taskId} companyId={companyId} actions={actions} inline onSent={scrollToEnd} />
        </div>
      ) : (
        <div
          ref={dock}
          className="above-tabbar fixed inset-x-0 z-20 border-t border-border bg-bg px-4 pb-3 pt-3"
          // above the tab bar (D-112); on the keyboard when it is out — `.above-tabbar` with this
          // bar's own `--kb` (useKeyboardDock), written outside React in the viewport's own event
          style={{ bottom: "var(--tabbar-space)" }}
        >
          <Composer taskId={taskId} companyId={companyId} actions={actions} onSent={scrollToEnd} />
        </div>
      )}
    </>
  );
}
