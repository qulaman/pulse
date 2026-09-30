"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DirectorTasksView } from "@/components/tasks/list/DirectorTasksView";
import { EmployeeTasksView } from "@/components/tasks/list/EmployeeTasksView";
import { toast } from "@/components/ui/Toast";
import type { BoardTask } from "@/lib/pulse/board";
import type { TaskActions } from "@/lib/tasks/mutations";
import type { TaskWithPeople } from "@/lib/tasks/queries";

import { build, DIRECTOR } from "./fixtures";

/**
 * The real «Задачи» and «Мои дела» views on fixtures. The actions change the fixtures in
 * memory — cards leave their tab, the next one opens, toasts speak — and nothing reaches
 * the network or anybody's phone.
 */
export function Sandbox({ role, empty }: { role: "director" | "employee"; empty: boolean }) {
  const initial = useMemo(() => (empty ? { tasks: [], board: [] } : build()), [empty]);
  const [tasks, setTasks] = useState<TaskWithPeople[]>(initial.tasks);
  const [board, setBoard] = useState<BoardTask[]>(initial.board);
  const now = useMemo(() => new Date(), []);
  // the server holds more closed tasks than the first page (D-130): «Показать ещё» brings
  // copies of the closed fixtures, a month older
  const [olderLeft, setOlderLeft] = useState(empty ? 0 : 24);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const closedNow = tasks.filter((task) => ["done", "revoked", "declined"].includes(task.status));
  const loadOlder = () => {
    setLoadingOlder(true);
    setTimeout(() => {
      const month = 30 * 86_400_000;
      const older = Array.from({ length: olderLeft }, (_, i) => {
        const base = closedNow[i % Math.max(1, closedNow.length)];
        const at = new Date(now.getTime() - month - i * 86_400_000).toISOString();
        return { ...base, id: `older-${i}`, title: `${base.title} (архив ${i + 1})`, closed_at: at, created_at: at, updated_at: at };
      });
      setTasks((list) => [...list, ...older]);
      setOlderLeft(0);
      setLoadingOlder(false);
    }, 600);
  };

  const patch = (taskId: string, change: Partial<TaskWithPeople>) => {
    setTasks((list) => list.map((task) => (task.id === taskId ? { ...task, ...change, updated_at: new Date().toISOString() } : task)));
    setBoard((list) => list.map((row) => (row.id === taskId ? { ...row, ...change } : row)));
  };
  const stamp = new Date().toISOString();

  const actions: TaskActions = {
    transition: ({ taskId, toStatus }) => {
      const extra: Partial<TaskWithPeople> =
        toStatus === "accepted"
          ? { accepted_at: stamp }
          : toStatus === "pending_review"
            ? { completed_at: stamp }
            : toStatus === "done" || toStatus === "declined"
              ? { closed_at: stamp }
              : {};
      patch(taskId, { status: toStatus, ...extra });
    },
    complete: ({ taskId }) => patch(taskId, { status: "pending_review", completed_at: stamp }),
    revoke: (taskId) => patch(taskId, { status: "revoked", closed_at: stamp }),
    sendNow: (taskId) => patch(taskId, { status: "sent", scheduled_send_at: stamp }),
    extend: ({ taskId, deadlineIso }) => patch(taskId, { deadline: deadlineIso }),
    reassign: ({ taskId, assigneeName }) => patch(taskId, { assignee: { full_name: assigneeName } }),
    sendMessage: ({ taskId }) => setBoard((list) => list.map((row) => (row.id === taskId ? { ...row, question: null } : row))),
    remove: (taskId) => {
      setTasks((list) => list.filter((task) => task.id !== taskId));
      setBoard((list) => list.filter((row) => row.id !== taskId));
    },
    markRead: () => {},
    requestTime: ({ taskId, fromStatus, proposedIso, words }) => {
      if (fromStatus === "sent") patch(taskId, { status: "accepted", accepted_at: stamp });
      setBoard((list) =>
        list.map((row) =>
          row.id === taskId
            ? { ...row, time_request: { id: `${taskId}-t`, proposed: proposedIso, words: words ?? null, at: stamp, senderId: row.assignee_id } }
            : row,
        ),
      );
    },
    answerTime: ({ taskId, approve, proposedIso }) => {
      if (approve && proposedIso) patch(taskId, { deadline: proposedIso });
      setBoard((list) => list.map((row) => (row.id === taskId ? { ...row, time_request: null } : row)));
    },
    nudge: ({ taskId, name }) => {
      setBoard((list) => list.map((row) => (row.id === taskId ? { ...row, nudged_at: stamp } : row)));
      toast(name ? `Напомнил · ${name}` : "Напомнил");
    },
    busy: false,
  };

  const mine = tasks.filter((task) => task.assignee_id === "u-marat");

  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-border/80 bg-bg px-4 py-2">
        <div className="mx-auto flex max-w-lg items-center gap-2 text-[13px]">
          <span className="font-display font-bold text-accent">/dev/tasks</span>
          <Link className={role === "director" ? "text-text" : "text-muted"} href="/dev/tasks?role=director">
            Директор
          </Link>
          <Link className={role === "employee" ? "text-text" : "text-muted"} href="/dev/tasks?role=employee">
            Сотрудник
          </Link>
          <Link className={empty ? "text-text" : "text-muted"} href={`/dev/tasks?role=${role}${empty ? "" : "&empty=1"}`}>
            Пусто
          </Link>
        </div>
      </header>
      {role === "director" ? (
        <DirectorTasksView
          meId={DIRECTOR.id}
          companyId="company"
          tasks={tasks}
          board={board}
          actions={actions}
          now={now}
          onPurge={(done) => {
            setTasks((list) => list.filter((task) => !["done", "revoked", "declined"].includes(task.status)));
            setOlderLeft(0);
            done();
          }}
          closedPages={{ total: closedNow.length + olderLeft, loading: loadingOlder, onMore: loadOlder }}
        />
      ) : (
        <EmployeeTasksView
          meId="u-marat"
          companyId="company"
          tasks={mine}
          board={board.filter((row) => row.assignee_id === "u-marat")}
          actions={actions}
          now={now}
        />
      )}
    </div>
  );
}
