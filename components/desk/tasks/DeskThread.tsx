"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";

import { messageFlags } from "@/components/tasks/TaskThread";
import { PhotoMessage } from "@/components/tasks/PhotoMessage";
import { VoiceMessage } from "@/components/tasks/thread/VoiceMessage";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { clearDraft, readDraft, writeDraft } from "@/lib/desk/drafts";
import { DESK_STATUS_LABEL, opensRun, type LoadState } from "@/lib/desk/tasks";
import { PHOTO_MIME, shrinkPhoto, uploadPhotoBlob } from "@/lib/files/photo";
import { claimMedia, dropMedia, handOverMedia, keepMedia, releaseMedia, type PendingMedia } from "@/lib/media/pending";
import { showKeptMedia } from "@/lib/media/show";
import { shortName } from "@/lib/people/names";
import { TIME_ANSWER_WORD } from "@/lib/tasks/lifecycle";
import type { TaskActions } from "@/lib/tasks/mutations";
import { fetchEarlierMessages, isPendingMessage, prependMessages, THREAD_PAGE, type Me, type TaskMessage } from "@/lib/tasks/queries";
import { receiptLine, useThreadReceipt } from "@/lib/tasks/receipts";
import { TEXT, type TaskStatus } from "@/lib/tasks/status-text";
import { dayLabel, messageState, startsNewDay, withoutPassedRevoke } from "@/lib/tasks/thread";
import { fitHeight } from "@/lib/ui/fitHeight";
import { useUpdateHold } from "@/lib/update/client";

import { LoadNote } from "./LoadState";

/** Eight lines of the field, then the words scroll. */
const MAX_FIELD_PX = 8 * 20 + 18;

/** What a message is, in the thread's own small words: «Отчёт», «Вопрос · ждёт ответа», «Причина отказа». */
function tagOf(message: TaskMessage): { text: string; tone: "warn" | "danger" | "muted" } | null {
  const flags = messageFlags(message);
  if (flags.report) return { text: flags.partial ? "Отчёт · сделано не всё" : "Отчёт", tone: "muted" };
  if (flags.timeRequest) return { text: `Просьба о сроке · ${flags.timeAnswer ? TIME_ANSWER_WORD[flags.timeAnswer] : "ждёт ответа"}`, tone: flags.timeAnswer ? "muted" : "warn" };
  if (flags.handoffNote) return { text: "При передаче", tone: "muted" };
  if (flags.declineReason) return { text: "Причина отказа", tone: "danger" };
  if (flags.reworkComment) return { text: "Комментарий к доработке", tone: "muted" };
  if (flags.isQuestion) return { text: flags.answered ? "Вопрос · отвечено" : "Вопрос · ждёт ответа", tone: flags.answered ? "muted" : "warn" };
  return null;
}

const TAG_COLOR = { warn: "var(--warn)", danger: "var(--danger)", muted: "var(--text-muted)" } as const;

/** «0:07» of a voice kept on the computer for want of network. */
function durationOf(message: TaskMessage): number | null {
  const value = (message.meta as { duration_ms?: unknown } | null)?.duration_ms;
  return typeof value === "number" && value > 0 ? value : null;
}

function keptHere(message: TaskMessage): boolean {
  return (message.meta as { kept?: unknown } | null)?.kept === true && !message.file_path;
}

/** «Принята · 14:41» — a line of the order's own history in the same feed (D-64 §4). */
function HistoryLine({ message }: { message: TaskMessage }) {
  const status = messageFlags(message).newStatus as TaskStatus | null;
  const label = message.type === "system" ? (message.content ?? "Изменение") : status ? (DESK_STATUS_LABEL[status] ?? status) : "Статус изменён";
  return (
    <p className="flex items-baseline gap-2 py-1 text-[12px] leading-4 text-muted" data-testid="system-row">
      <span className="min-w-0 truncate">{label}</span>
      <span className="nums shrink-0">{humanAqtobe(new Date(message.created_at)).replace(/^сегодня /, "")}</span>
    </p>
  );
}

/**
 * The thread at the desk's density (D-154 wave 3): one column of words, not bubbles left and right —
 * a name and a time open a run of one person's words, the next ones within five minutes hang under
 * it; the order's history as quiet lines; photos and voices in place; what is on its way with a
 * clock, what failed with «повторить»; under the director's last word, how far it got (принцип 8).
 * The panel or the page scrolls it — the thread has no scroller of its own. A thread that did not
 * load says so: «Переписки пока нет» is said only of one that came back empty.
 */
export function DeskThread({
  taskId,
  me,
  messages,
  loading,
  load,
  onRetry,
  actions,
}: {
  taskId: string;
  me: Me;
  messages: TaskMessage[] | undefined;
  loading: boolean;
  load: LoadState;
  onRetry: () => void;
  actions: TaskActions;
}) {
  const queryClient = useQueryClient();
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const receipt = useThreadReceipt(taskId, true, me.userId);
  const line = receiptLine(receipt.data);
  const rows = withoutPassedRevoke(messages ?? []);
  const lastMine = [...rows].reverse().find((message) => message.sender_id === me.userId && !isPendingMessage(message));

  const showEarlier = async () => {
    const oldest = rows.find((message) => !isPendingMessage(message));
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const page = await fetchEarlierMessages(taskId, oldest.seq);
      if (page.length < THREAD_PAGE) setHasMore(false);
      if (page.length > 0) prependMessages(queryClient, taskId, page);
    } finally {
      setLoadingMore(false);
    }
  };
  const retry = (message: TaskMessage) =>
    actions.sendMessage({ taskId, companyId: me.companyId, text: message.content ?? "", filePath: message.file_path, type: message.type as "text" | "photo" | "voice", id: message.id });

  if (loading && rows.length === 0) return <p className="py-2 text-[13px] leading-5 text-muted">Загружаю переписку…</p>;
  if (rows.length === 0 && load.kind === "failed") return <LoadNote state={load} failed="Переписка не загрузилась" onRetry={onRetry} className="py-2" />;
  if (rows.length === 0) return <p className="py-2 text-[13px] leading-5 text-muted">Переписки пока нет — вопрос, отчёт или фото появятся здесь</p>;

  return (
    <div className="flex flex-col" data-testid="thread">
      <LoadNote state={load} failed="Новые сообщения не загрузились" onRetry={onRetry} className="pb-1" />
      {rows.length >= THREAD_PAGE && hasMore ? (
        <button type="button" onClick={() => void showEarlier()} disabled={loadingMore} className="mb-2 self-start py-1 text-[12px] leading-4 text-muted hover:text-text">
          {loadingMore ? "Загружаю…" : "Показать раньше"}
        </button>
      ) : null}
      {rows.map((message, index) => {
        const previous = rows[index - 1];
        const day = startsNewDay(previous, message);
        const system = message.type === "status_change" || message.type === "system";
        const head = day || opensRun(previous, message);
        const mine = message.sender_id === me.userId;
        const state = messageState(message);
        const tag = system ? null : tagOf(message);
        return (
          <div key={message.id}>
            {day ? (
              <p className={`text-[12px] leading-4 text-muted ${index > 0 ? "mt-3 border-t border-border pt-1" : "pt-1"}`} data-testid="day-separator">
                {dayLabel(message.created_at)}
              </p>
            ) : null}
            {system ? (
              <HistoryLine message={message} />
            ) : (
              <div className={`group/message ${head ? "mt-1.5" : ""} ${state === "pending" ? "opacity-60" : ""}`} data-testid="message-row" data-state={state}>
                <div className="min-w-0">
                  {head ? (
                    <p className="flex items-baseline gap-2 text-[13px] leading-5">
                      <span className="font-semibold">{mine ? "Вы" : shortName(message.sender?.full_name) || "—"}</span>
                      <span className="nums text-muted">{humanAqtobe(new Date(message.created_at)).replace(/^сегодня /, "")}</span>
                      {state === "pending" ? <span className="text-muted">· отправляю…</span> : null}
                    </p>
                  ) : null}
                  {tag ? (
                    <p className="text-[12px] font-medium leading-4" style={{ color: TAG_COLOR[tag.tone] }}>
                      {tag.text}
                    </p>
                  ) : null}
                  {message.content ? <p className="max-w-[76ch] whitespace-pre-line text-[14px] leading-5 [overflow-wrap:anywhere]">{message.content}</p> : null}
                  {keptHere(message) ? (
                    <p className="text-[13px] leading-5 text-muted" data-testid="message-kept">
                      {message.type === "voice" ? `Голосовое 0:${String(Math.max(1, Math.round((durationOf(message) ?? 0) / 1000))).padStart(2, "0")}` : "Фото"} · ждёт связи
                    </p>
                  ) : null}
                  {message.type === "photo" && message.file_path && state === "sent" ? (
                    <div className="max-w-[340px]">
                      <PhotoMessage messageId={message.id} />
                    </div>
                  ) : null}
                  {message.type === "voice" && message.file_path && state === "sent" ? (
                    <div className="mt-1 max-w-[300px]">
                      <VoiceMessage messageId={message.id} durationMs={durationOf(message)} />
                    </div>
                  ) : null}
                  {state === "failed" ? (
                    <button type="button" onClick={() => retry(message)} className="text-[12px] leading-4 text-danger underline decoration-dotted underline-offset-2">
                      не отправилось · повторить
                    </button>
                  ) : null}
                  {line && lastMine?.id === message.id && state === "sent" ? (
                    <p className="mt-0.5 text-[12px] leading-4 text-muted" data-testid="thread-receipt">
                      {line.text}
                      {/* at night the words wait for the morning — unless the director says «now» (D-129) */}
                      {line.held ? (
                        <>
                          {" · "}
                          <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => actions.sendNow(taskId)} data-testid="thread-send-now">
                            отправить сейчас
                          </button>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The answer field of the desk (D-154 wave 3): Enter sends, Shift+Enter breaks the line, a picture
 * pasted (Ctrl+V), dropped or attached goes as a photo with the words as its caption. The photo is
 * kept in the browser before it is sent (принцип 5, D-130): with no network it waits in the thread
 * and goes later under the same id. A voice is the phone's — the desk writes. What is typed lives
 * by the task (`lib/desk/drafts.ts`): another row, a closed panel or a reload take none of it; it
 * is let go when it is handed to the thread, which holds the words from there — with a clock, in
 * the outbox with no network, with «повторить» when the server refuses.
 */
export function DeskComposer(props: ComposerProps) {
  // one field per task: the words of one never show under another
  return <Composer key={props.taskId} {...props} />;
}

type ComposerProps = {
  taskId: string;
  me: Me;
  actions: TaskActions;
  placeholder?: string;
  onSent?: () => void;
};

function Composer({ taskId, me, actions, placeholder = "Ответить…", onSent }: ComposerProps) {
  const [draft, setDraftText] = useState(() => readDraft(me.userId, taskId));
  const setDraft = (text: string) => {
    setDraftText(text);
    writeDraft(me.userId, taskId, text);
  };
  const dropDraft = () => {
    setDraftText("");
    clearDraft(me.userId, taskId);
  };
  const [uploading, setUploading] = useState(false);
  const [over, setOver] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  // a photo is carried by this page until it is uploaded: an app update waits (D-115)
  useUpdateHold(uploading);

  useEffect(() => {
    const el = field.current;
    if (!el) return;
    fitHeight(el, MAX_FIELD_PX, el.offsetHeight - el.clientHeight);
  }, [draft]);

  const sendText = () => {
    const text = draft.trim();
    if (!text) return;
    actions.sendMessage({ taskId, companyId: me.companyId, text });
    dropDraft();
    onSent?.();
  };

  const sendPhoto = async (picked: File | null | undefined) => {
    if (!picked || !picked.type.startsWith("image/") || uploading) return;
    setUploading(true);
    try {
      const { blob, ext } = await shrinkPhoto(picked);
      const text = draft.trim();
      const item: PendingMedia = {
        id: crypto.randomUUID(),
        kind: "photo",
        userId: me.userId,
        companyId: me.companyId,
        taskId,
        crid: crypto.randomUUID(),
        blob,
        mime: PHOTO_MIME[ext],
        ext,
        durationMs: null,
        text,
        partial: false,
        filePath: null,
        createdAt: new Date().toISOString(),
        attempts: 0,
      };
      // the same way as the phone's field: kept first, sent, or left waiting in the thread
      const kept = await keepMedia(item);
      if (kept) claimMedia(item.id);
      try {
        const filePath = await uploadPhotoBlob(blob, ext, item.crid);
        actions.sendMessage({ id: item.id, taskId, companyId: me.companyId, text, filePath, type: "photo" });
        if (kept) {
          releaseMedia(item.id);
          void dropMedia(item.id);
        }
      } catch {
        if (!kept) {
          toast(TEXT.photoFailed);
          return;
        }
        showKeptMedia(queryClient, item, me);
        handOverMedia(item.id);
        toast("Нет связи. Фото отправлю, как появится");
      }
      dropDraft();
      onSent?.();
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const picture = [...event.clipboardData.files].find((one) => one.type.startsWith("image/"));
    if (!picture) return;
    event.preventDefault();
    void sendPhoto(picture);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    setOver(false);
    const picture = [...event.dataTransfer.files].find((one) => one.type.startsWith("image/"));
    if (!picture) return;
    event.preventDefault();
    void sendPhoto(picture);
  };

  return (
    <div
      data-testid="desk-composer"
      onDragOver={(event) => {
        if (![...event.dataTransfer.items].some((item) => item.kind === "file")) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`rounded-[2px] border transition-colors duration-[120ms] focus-within:border-accent ${over ? "border-dashed border-accent" : "border-border"}`}
    >
      <input ref={file} type="file" accept="image/*" className="hidden" aria-label="Приложить фото" onChange={(event) => void sendPhoto(event.target.files?.[0])} />
      <textarea
        ref={field}
        rows={1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onPaste={onPaste}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          if (event.shiftKey && !event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          sendText();
        }}
        placeholder={over ? "Отпустите — фото уйдёт в переписку" : placeholder}
        aria-label="Ответ в переписку"
        className="no-bar block min-h-[40px] w-full resize-none bg-transparent px-3 py-2.5 text-[14px] leading-5 outline-none placeholder:text-muted"
      />
      <div className="flex items-center gap-2 px-1.5 pb-1.5">
        <button
          type="button"
          onClick={() => file.current?.click()}
          disabled={uploading}
          title="Приложить фото — или вставьте его (Ctrl+V), или перетащите сюда"
          aria-label="Приложить фото"
          className="flex h-7 w-7 items-center justify-center rounded-[2px] text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text disabled:opacity-50"
        >
          {uploading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2" />
            </svg>
          )}
        </button>
        <span className="min-w-0 flex-1 truncate text-[12px] leading-4 text-muted">{uploading ? "Отправляю фото…" : draft.trim() ? "Enter — отправить" : ""}</span>
        <button
          type="button"
          onClick={sendText}
          disabled={!draft.trim()}
          className="desk-move inline-flex h-7 items-center rounded-[2px] border px-2 text-[13px] leading-4 transition-opacity duration-[120ms] disabled:opacity-30"
          data-testid="desk-composer-send"
        >
          Отправить
        </button>
      </div>
    </div>
  );
}

/** The caret into the answer field under `root` — the thread may still be landing: a few tries, then nothing. */
export function focusComposer(root: Element | null, tries = 8) {
  const field = root?.querySelector<HTMLTextAreaElement>('[data-testid="desk-composer"] textarea');
  if (field) {
    field.focus({ preventScroll: true });
    field.scrollIntoView({ block: "nearest" });
    return;
  }
  if (tries > 0) setTimeout(() => focusComposer(root, tries - 1), 120);
}
