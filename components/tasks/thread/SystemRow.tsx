import { humanAqtobe } from "@/lib/ai/time";
import type { TaskMessage } from "@/lib/tasks/queries";
import { STATUS_LABEL, type TaskStatus } from "@/lib/tasks/status-text";
import { messageFlags } from "@/components/tasks/TaskThread";

/**
 * A status change or an edit of the order, in the same feed as the words: one thin
 * line, centred, no bubble. The thread is one story — a separate timeline made the
 * reader jump between two lists to learn what happened when.
 */
export function SystemRow({ message }: { message: TaskMessage }) {
  const flags = messageFlags(message);
  const status = flags.newStatus as TaskStatus | null;
  const label = message.type === "system" ? (message.content ?? "Изменение") : status ? (STATUS_LABEL[status] ?? status) : "Статус изменён";

  return (
    <p className="py-1 text-center text-[12px] leading-4 text-muted" data-testid="system-row">
      {label} · <span className="nums">{humanAqtobe(new Date(message.created_at))}</span>
    </p>
  );
}
