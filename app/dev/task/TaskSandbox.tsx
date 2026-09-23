"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

import { TaskDetail } from "@/components/tasks/detail/TaskDetail";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { Me, TaskWithPeople } from "@/lib/tasks/queries";

import { build, DIRECTOR, messagesFor } from "../tasks/fixtures";

/**
 * The task's own screen (D-87) on a fixture task: the actions change it in memory, so the
 * status screen, the steps and the buttons can be watched moving — nothing reaches the network.
 */
export function TaskSandbox({ role, id }: { role: "director" | "employee"; id: string }) {
  // the fixtures are now-relative: drawn in the browser only, or the server's «now» and the
  // browser's disagree and React reports a mismatch on every visit
  const client = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return client ? <Sandbox role={role} id={id} /> : null;
}

function Sandbox({ role, id }: { role: "director" | "employee"; id: string }) {
  const fixtures = useMemo(() => build(), []);
  const [task, setTask] = useState<TaskWithPeople | null>(() => fixtures.tasks.find((t) => t.id === id) ?? null);
  const board = fixtures.board.find((row) => row.id === id);
  const messages = useMemo(() => (task ? messagesFor(task, board) : []), [task, board]);
  const now = useMemo(() => new Date(), []);

  const me: Me =
    role === "director"
      ? { userId: DIRECTOR.id, companyId: "company", role: "director", isActive: true, fullName: DIRECTOR.name }
      : { userId: task?.assignee_id ?? "u-marat", companyId: "company", role: "employee", isActive: true, fullName: task?.assignee?.full_name ?? "" };

  const stamp = new Date().toISOString();
  const patch = (change: Partial<TaskWithPeople>) => setTask((current) => (current ? { ...current, ...change } : current));
  const actions: TaskActions = {
    transition: ({ toStatus }) =>
      patch({
        status: toStatus,
        ...(toStatus === "accepted" ? { accepted_at: stamp } : toStatus === "pending_review" ? { completed_at: stamp } : toStatus === "done" ? { closed_at: stamp } : {}),
      }),
    complete: () => patch({ status: "pending_review", completed_at: stamp }),
    revoke: () => patch({ status: "revoked", closed_at: stamp }),
    extend: ({ deadlineIso }) => patch({ deadline: deadlineIso }),
    reassign: ({ assigneeName }) => patch({ assignee: { full_name: assigneeName } }),
    sendMessage: () => {},
    remove: () => setTask(null),
    markRead: () => {},
    busy: false,
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border/80 bg-bg px-4 py-2">
        <div className="no-bar mx-auto flex max-w-lg items-center gap-2 overflow-x-auto whitespace-nowrap text-[13px]">
          <span className="font-display font-bold text-accent">/dev/task</span>
          <Link className={role === "director" ? "text-text" : "text-muted"} href={`/dev/task?id=${id}&role=director`}>
            Директор
          </Link>
          <Link className={role === "employee" ? "text-text" : "text-muted"} href={`/dev/task?id=${id}&role=employee`}>
            Сотрудник
          </Link>
          {fixtures.tasks.map((t) => (
            <Link key={t.id} className={t.id === id ? "text-accent" : "text-muted"} href={`/dev/task?id=${t.id}&role=${role}`}>
              {t.id.replace("fx-", "#")}
            </Link>
          ))}
        </div>
      </header>
      {task ? (
        <TaskDetail task={task} messages={messages} messagesLoading={false} me={me} base={actions} now={now} onBack={() => history.back()} />
      ) : (
        <p className="p-6 text-muted">Удалена</p>
      )}
    </div>
  );
}
