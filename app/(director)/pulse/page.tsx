"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { InstallHint } from "@/components/InstallHint";
import { EtherSection } from "@/components/ether/EtherSection";
import type { MascotState } from "@/components/brand/Mascot";
import { Assistant, type AssistantLine } from "@/components/pulse/Assistant";
import { CardDeck } from "@/components/pulse/CardDeck";
import { LiveBoard } from "@/components/pulse/LiveBoard";
import { MascotLever, useLeverHint } from "@/components/pulse/MascotLever";
import { TaskBalls, type Ball } from "@/components/pulse/TaskBalls";
import { useSpeech } from "@/components/pulse/useSpeech";
import { PushCard } from "@/components/push/PushCard";
import { Button } from "@/components/ui/Button";
import { initialsOf, usePeople } from "@/lib/people/queries";
import { usePointsEnabled } from "@/lib/points/queries";
import { answer } from "@/lib/pulse/answers";
import { ATTENTION_LANES, countsOf, LANE_ORDER, lanesOf, toBriefTask, WORK_STATUSES } from "@/lib/pulse/board";
import { useLastVisit, useNow } from "@/lib/pulse/queries";
import { isCountable, useIngestStore } from "@/lib/store/ingest";
import { useTaskActions } from "@/lib/tasks/mutations";
import { useMe, usePulseBoard, useSentTasks } from "@/lib/tasks/queries";
import { firstNameOf } from "@/lib/text/normalize";
import { useMediaQuery } from "@/lib/useMediaQuery";

type Exchange = { key: string; said: string; lines: string[]; understood: boolean };

/** idle — the face alone in the middle; ring — the balls around it; card — one card open under the row of balls. */
type Mode = "idle" | "ring" | "card";

const FACE = 128;
const FACE_SMALL = 88;
/** Distance from the face's centre to the balls' centres. */
const RING_RADIUS = 122;

/**
 * Пульс — the director's home (D-57, D-60): the face of «Капля» alone in the middle of
 * the screen. Hold it to speak, pull it down to type, tap it and the tasks come out as
 * balls around it; a tap on a ball opens that task as a card with the deck gestures.
 * The gesture hint lives at the bottom; service lines (push, draft) appear only after
 * the tap, under the assistant's line. A wide screen gets the live board instead of balls.
 */
export default function PulsePage() {
  const me = useMe();
  const board = usePulseBoard();
  const since = useLastVisit();
  const now = useNow();
  const actions = useTaskActions(me.data);
  const companyId = me.data?.companyId ?? "";
  const directorName = firstNameOf(me.data?.fullName);
  const router = useRouter();

  const stage = useIngestStore((state) => state.stage);
  const entities = useIngestStore((state) => state.entities);
  const question = useIngestStore((state) => state.question);
  const requestId = useIngestStore((state) => state.clientRequestId);
  const resetIngest = useIngestStore((state) => state.reset);
  const startManual = useIngestStore((state) => state.startManual);
  const pointsEnabled = usePointsEnabled().data === true;
  const draftCount = stage === "confirm" ? entities.filter((entity) => isCountable(entity, pointsEnabled)).length : 0;

  const loading = me.isLoading || board.isLoading;
  const rows = board.data;
  const lanes = useMemo(() => lanesOf(rows ?? [], now), [rows, now]);
  const counts = countsOf(lanes);
  const speech = useSpeech(rows, lanes, now, directorName);
  const wide = useMediaQuery("(min-width: 640px)");
  const showHint = useLeverHint();

  // ---- the balls and the card -------------------------------------------------------------
  const [mode, setMode] = useState<Mode>("idle");
  const [active, setActive] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; key: number } | null>(null);

  const balls = useMemo<Ball[]>(() => {
    const list: Ball[] = [];
    for (const lane of LANE_ORDER) {
      if (!ATTENTION_LANES.has(lane)) continue;
      for (const task of lanes[lane]) {
        const name = task.assignee?.full_name ?? "";
        list.push({ kind: "task", id: task.id, lane, initials: name ? initialsOf(name) : "•", name: firstNameOf(name) || "Без исполнителя" });
      }
    }
    if (lanes.work.length > 0) list.push({ kind: "work", id: "work", count: lanes.work.length });
    return list;
  }, [lanes]);

  const pick = (ball: Ball) => {
    if (ball.kind === "more") {
      router.push("/sent");
      return;
    }
    if (mode === "card" && active === ball.id) {
      // the open ball again: the card folds back
      setMode("ring");
      setActive(null);
      return;
    }
    setActive(ball.id);
    setFocus({ id: ball.id, key: Date.now() });
    setMode("card");
  };
  const onCurrentChange = useCallback((id: string | null) => setActive(id), []);

  // ---- a question the phrase turned out to be ---------------------------------------------
  const people = usePeople();
  const asked = stage === "question" && question ? question : null;
  // the closed list (200 rows, two joins) is fetched only while a question needs it
  const sent = useSentTasks(asked ? me.data?.userId : undefined);
  const reply = useMemo(() => {
    if (!asked || !rows || people.isLoading || sent.isLoading) return null;
    return answer({
      question: asked,
      now,
      people: (people.data ?? [])
        .filter((p) => p.is_active && p.role !== "tv")
        .map((p) => ({ id: p.id, fullName: p.full_name, aliases: p.aliases ?? [] })),
      open: rows.filter((t) => WORK_STATUSES.includes(t.status)).map((t) => ({ ...toBriefTask(t), status: t.status })),
      closed: (sent.data ?? [])
        .filter((t) => t.status === "done" || t.status === "declined" || t.status === "revoked")
        .map((t) => ({ id: t.id, title: t.title, deadline: t.deadline, assignee: t.assignee?.full_name ? firstNameOf(t.assignee.full_name) : null, assigneeId: t.assignee_id, status: t.status, closedAt: t.closed_at })),
      overdue: lanes.overdue.map(toBriefTask),
      declined: lanes.declined.map((t) => ({ ...toBriefTask(t), reason: t.decline_reason })),
      questions: lanes.question.map(toBriefTask),
      review: lanes.review.map(toBriefTask),
    });
  }, [asked, now, rows, lanes, people.isLoading, people.data, sent.isLoading, sent.data]);

  // The exchange stays on screen after the pipeline goes idle: the assistant keeps its
  // answer until the director asks again, taps the face, or closes it.
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const exchangeKey = asked ? (requestId ?? asked) : null;
  if (asked && reply && exchangeKey && exchange?.key !== exchangeKey) {
    setExchange({ key: exchangeKey, said: asked, lines: reply.lines, understood: reply.understood });
  }
  useEffect(() => {
    if (asked && reply?.understood) resetIngest();
  }, [asked, reply, resetIngest]);
  const closeExchange = () => {
    setExchange(null);
    if (stage === "question") resetIngest();
  };

  // the face alone when idle: the opening line waits for a tap; a change on the board is said at once
  const lines = useMemo<AssistantLine[]>(() => {
    if (exchange) return exchange.lines.map((text, i) => ({ id: `${exchange.key}:${i}`, text }));
    if (!speech.line) return [];
    if (mode === "idle" && !wide && speech.line.opening) return [];
    return [speech.line];
  }, [exchange, speech.line, mode, wide]);

  const onFaceTap = () => {
    closeExchange();
    if (mode === "idle") {
      speech.replay();
      setMode("ring");
    } else {
      setMode("idle");
      setActive(null);
    }
  };

  const mascot: MascotState = loading ? "thinking" : speech.speaking ? "speaking" : counts.attention > 0 ? "calm" : "happy";
  const team = (people.data ?? []).filter((p) => p.is_active && p.role !== "director" && p.role !== "tv");
  const faceSize = mode === "card" && !wide ? FACE_SMALL : FACE;
  const box = mode === "ring" ? RING_RADIUS * 2 + 56 : faceSize + 24;

  const serviceLines = (
    <>
      {draftCount > 0 ? (
        <Link href="/confirm" className="card-in relative block py-1 pl-4 text-[15px] leading-5">
          <span aria-hidden className="absolute left-0 top-[8px] h-2 w-2 rounded-full bg-accent" />
          Черновик: {draftCount} {draftCount === 1 ? "сущность" : draftCount < 5 ? "сущности" : "сущностей"}, не отправлен.{" "}
          <span className="text-accent">Открыть ›</span>
        </Link>
      ) : null}
      {people.data && team.length === 0 ? (
        <Link href="/people/new" className="card-in relative block py-1 pl-4 text-[15px] leading-5">
          <span aria-hidden className="absolute left-0 top-[8px] h-2 w-2 rounded-full bg-accent" />
          В команде пока никого. Добавь первого сотрудника. <span className="text-accent">Добавить ›</span>
        </Link>
      ) : null}
      <PushCard bubble />
      <InstallHint bubble />
    </>
  );

  if (wide) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-24 pt-3">
        <div className="flex flex-col items-center">
          <MascotLever state={mascot} onTap={onFaceTap} size={FACE} />
        </div>
        <div className="mt-2">
          <Assistant said={exchange?.said ?? null} lines={loading && lines.length === 0 ? [{ id: "loading", text: "Смотрю, что нового…" }] : lines}>
            {exchange ? <ExchangeButtons exchange={exchange} onManual={startManual} onClose={closeExchange} /> : null}
            {serviceLines}
          </Assistant>
        </div>
        <LiveBoard rows={rows} now={now} since={since} actions={actions} companyId={companyId} />
        <EtherSection variant="director" />
      </main>
    );
  }

  return (
    <main
      className={`mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-12 ${mode === "idle" ? "justify-center" : "justify-start pt-2"}`}
      style={{ overscrollBehaviorY: "contain" }}
      data-mode={mode}
    >
      <LayoutGroup>
        {/* the face, and the balls around it (ring) or in a row under it (card) */}
        <div className="relative flex flex-col items-center">
          <motion.div layout className="relative flex items-center justify-center" style={{ width: box, height: box }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
            <MascotLever state={mascot} onTap={onFaceTap} size={faceSize} />
            <AnimatePresence>
              {mode === "ring" ? <TaskBalls key="ring" balls={balls} mode="ring" activeId={active} radius={RING_RADIUS} onPick={pick} /> : null}
            </AnimatePresence>
          </motion.div>
          <AnimatePresence>
            {mode === "card" ? (
              <motion.div key="row" layout className="mt-1 w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <TaskBalls balls={balls} mode="row" activeId={active} radius={RING_RADIUS} onPick={pick} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <motion.div layout className="mt-3">
          <Assistant said={exchange?.said ?? null} lines={loading && mode !== "idle" && lines.length === 0 ? [{ id: "loading", text: "Смотрю, что нового…" }] : lines}>
            {exchange ? <ExchangeButtons exchange={exchange} onManual={startManual} onClose={closeExchange} /> : null}
            {/* service lines only once the face has been tapped — the idle screen is the face alone */}
            {mode !== "idle" ? serviceLines : null}
          </Assistant>
        </motion.div>

        {mode === "card" ? (
          <motion.div layout initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}>
            <CardDeck lanes={lanes} now={now} since={since} actions={actions} companyId={companyId} focus={focus} onCurrentChange={onCurrentChange} />
          </motion.div>
        ) : null}

        {mode !== "idle" ? (
          <motion.div layout>
            <EtherSection variant="director" />
          </motion.div>
        ) : null}
      </LayoutGroup>

      {/* the bottom: the gesture hint — never under the face */}
      {showHint && mode === "idle" ? (
        <p
          className="pointer-events-none fixed inset-x-0 z-20 px-4 text-center text-[12px] leading-4 text-muted"
          style={{ bottom: "calc(56px + env(safe-area-inset-bottom) + 10px)" }}
          data-testid="lever-hint"
        >
          удержи — говори · тап — задачи · потяни вниз — текст
        </p>
      ) : null}
    </main>
  );
}

function ExchangeButtons({ exchange, onManual, onClose }: { exchange: Exchange; onManual: () => void; onClose: () => void }) {
  return (
    <div className="card-in flex flex-wrap justify-center gap-2 pt-1">
      {!exchange.understood ? (
        <Button variant="secondary" className="!min-h-[40px] !px-4 !text-[14px]" onClick={onManual}>
          Сделать задачей
        </Button>
      ) : null}
      <Button variant="ghost" className="!min-h-[40px] !px-3 !text-[14px]" onClick={onClose}>
        Закрыть
      </Button>
    </div>
  );
}
