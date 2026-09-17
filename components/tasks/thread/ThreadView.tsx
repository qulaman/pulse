"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { receiptLine, useThreadReceipt } from "@/lib/tasks/receipts";
import type { TaskActions } from "@/lib/tasks/mutations";
import { fetchEarlierMessages, isPendingMessage, prependMessages, THREAD_PAGE, type TaskMessage } from "@/lib/tasks/queries";
import { dayLabel, messageState, startsNewDay } from "@/lib/tasks/thread";
import { useVisualViewport } from "@/lib/ui/useVisualViewport";
import { Composer } from "./Composer";
import { DaySeparator } from "./DaySeparator";
import { MessageRow } from "./MessageRow";
import { SystemRow } from "./SystemRow";

const RECEIPT_TONE = { ok: "var(--ok)", warn: "var(--warn)", muted: "var(--text-muted)" } as const;
/** The tab bar the thread sits above, like every other screen. */
const TAB_BAR_PX = 56;

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
};

/**
 * The thread as one feed: words, photos, voice and the order's own history in the same
 * scroll, separated by days. The tail loads first (THREAD_PAGE messages) and «Показать
 * раньше» walks back a page at a time — a year-old task must open as fast as a new one.
 */
export function ThreadView({ taskId, companyId, messages, loading, userId, actions, isDirector = false, compact = false }: ThreadViewProps) {
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const offsetBottom = useVisualViewport();

  const receipt = useThreadReceipt(taskId, isDirector, userId);
  const line = isDirector ? receiptLine(receipt.data) : null;

  const rows = messages ?? [];
  // one receipt, under the last word that is mine — a tick per bubble would be noise
  const lastMine = [...rows].reverse().find((message) => message.sender_id === userId && !isPendingMessage(message));

  const scrollToEnd = useCallback(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, []);

  // the thread opens at its end, and follows it while new words arrive
  const count = rows.length;
  useEffect(() => {
    if (count > 0) scrollToEnd();
  }, [count, scrollToEnd]);
  // the keyboard takes half the screen: keep the last word above it
  useEffect(() => {
    if (offsetBottom > 0) scrollToEnd();
  }, [offsetBottom, scrollToEnd]);

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
      <section className={compact ? "flex flex-1 flex-col overflow-y-auto px-1 pb-2" : "mt-4 pb-28"} data-testid="thread">
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
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
          <div ref={bottom} />
        </div>
      </section>

      {compact ? (
        <div className="border-t border-border bg-bg px-1 pt-2">
          <Composer taskId={taskId} companyId={companyId} actions={actions} inline onSent={scrollToEnd} />
        </div>
      ) : (
        <div
          className="fixed inset-x-0 z-20 border-t border-border bg-bg px-4 pb-3 pt-3"
          // above the tab bar, and above the keyboard when it is out (D-60: nothing hides the field)
          style={{ bottom: `calc(${offsetBottom}px + ${TAB_BAR_PX}px + env(safe-area-inset-bottom))` }}
        >
          <Composer taskId={taskId} companyId={companyId} actions={actions} onSent={scrollToEnd} />
        </div>
      )}
    </>
  );
}
