"use client";

import { AnimatePresence } from "framer-motion";
import { useMemo, useRef, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { CardDeck } from "@/components/pulse/CardDeck";
import { ThoughtBubble } from "@/components/pulse/ThoughtBubble";
import { lanesOf, type BoardTask } from "@/lib/pulse/board";
import type { TaskActions } from "@/lib/tasks/mutations";

import { build, DIRECTOR } from "../tasks/fixtures";

const FACE = 128;
const FACE_SMALL = 88;

/**
 * The «Задачи» deck of Пульс and the thought over the face on fixtures (dev only): the real
 * `CardDeck` and `ThoughtBubble`, with a remote for what the board does on its own — a card
 * leaves (somebody else settled it), a new one lands, a thought comes and the face shrinks under
 * it. Nothing reaches the network; swipes act on the fixtures in memory.
 */
export function DeckSandbox() {
  const initial = useMemo(() => build().board, []);
  const [board, setBoard] = useState<BoardTask[]>(initial);
  const now = useMemo(() => new Date(), []);
  const lanes = useMemo(() => {
    const all = lanesOf(board, now, DIRECTOR.id);
    // the «Задачи» ball: every lane but the messages (those are the other ball)
    return { ...all, question: [] };
  }, [board, now]);
  const [current, setCurrent] = useState<string | null>(null);
  const [thought, setThought] = useState<{ id: string; text: string } | null>(null);
  const [small, setSmall] = useState(false);
  const serial = useRef(0);
  const since = useMemo(() => new Date(now.getTime() - 3_600_000).toISOString(), [now]);

  const patch = (taskId: string, change: Partial<BoardTask>) => setBoard((list) => list.map((row) => (row.id === taskId ? { ...row, ...change } : row)));
  const actions: TaskActions = {
    transition: ({ taskId, toStatus }) => patch(taskId, { status: toStatus }),
    complete: ({ taskId }) => patch(taskId, { status: "pending_review" }),
    revoke: (taskId) => patch(taskId, { status: "revoked" }),
    sendNow: () => {},
    extend: ({ taskId, deadlineIso }) => patch(taskId, { deadline: deadlineIso }),
    reassign: () => {},
    sendMessage: () => {},
    remove: (taskId) => setBoard((list) => list.filter((row) => row.id !== taskId)),
    markRead: () => {},
    requestTime: () => {},
    answerTime: () => {},
    nudge: () => {},
    busy: false,
  };

  // somebody else settled the card on top: it leaves the board under the director's eyes
  const leave = () => {
    if (current && current !== "work") setBoard((list) => list.filter((row) => row.id !== current));
  };
  // a task is handed in: a new card lands in «приёмка»
  const land = () => {
    const base = initial.find((row) => row.status === "pending_review") ?? initial[0]!;
    serial.current += 1;
    const n = serial.current;
    setBoard((list) => [{ ...base, id: `new-${n}`, title: `Новая сдача №${n}: ${base.title}`, updated_at: new Date().toISOString() }, ...list]);
  };

  return (
    <div className="mx-auto flex h-dvh w-full max-w-lg flex-col bg-bg">
      <header className="shrink-0 border-b border-border px-3 py-2">
        <p className="font-display text-[15px] font-semibold leading-5">Стопка · песочница</p>
        <div className="no-bar mt-1.5 flex gap-1.5 overflow-x-auto">
          <Chip onClick={leave} testid="sb-leave">Уходит верхняя</Chip>
          <Chip onClick={land} testid="sb-land">Новая сдача</Chip>
          <Chip onClick={() => setThought({ id: String(Date.now()), text: "Марат: задача «Подготовить отчёт по продажам» сдана, ждёт приёмки" })} testid="sb-thought">
            Мысль
          </Chip>
          <Chip onClick={() => setThought(null)} testid="sb-unthought">Без мысли</Chip>
          <Chip onClick={() => setSmall((v) => !v)} testid="sb-small">Лицо {small ? "88" : "128"}</Chip>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-4" data-board="">
        <div className="relative flex shrink-0 justify-center pt-24">
          <div className="relative flex items-center justify-center" style={{ width: FACE + 24, height: FACE + 24 }}>
            <div style={{ transform: `scale(${(small ? FACE_SMALL : FACE) / FACE})`, transition: "transform 300ms var(--ease-out)" }}>
              <Mascot state="checking" size={FACE} />
            </div>
            <AnimatePresence>
              {thought ? <ThoughtBubble key={thought.id} text={thought.text} tone="ok" faceSize={small ? FACE_SMALL : FACE} onDismiss={() => setThought(null)} /> : null}
            </AnimatePresence>
          </div>
        </div>
        <div className="no-bar flex min-h-0 flex-1 flex-col overflow-y-auto pb-4 pt-2">
          <CardDeck lanes={lanes} now={now} since={since} actions={actions} companyId="company" meId={DIRECTOR.id} focus={null} onCurrentChange={setCurrent} />
        </div>
      </main>
    </div>
  );
}

function Chip({ onClick, children, testid }: { onClick: () => void; children: React.ReactNode; testid: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] font-semibold leading-4 text-muted"
    >
      {children}
    </button>
  );
}
