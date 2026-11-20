"use client";

import { useEffect, useMemo, useState } from "react";

import { useStableCallback } from "@/components/pulse/stable";
import { answer, answerInput } from "@/lib/pulse/answers";
import type { BoardTask, Lanes } from "@/lib/pulse/board";
import type { IngestStage } from "@/lib/store/ingest";
import { useSentTasks } from "@/lib/tasks/queries";

/** A question and the assistant's answer to it, kept on screen after the pipeline goes idle. */
export type Exchange = { key: string; said: string; lines: string[]; understood: boolean };

type PersonRow = { id: string; full_name: string; aliases: string[] | null; is_active: boolean; role: string };

/**
 * A phrase that turned out to be a question (D-51 п.4): answered from the board right on Пульс.
 * The closed list (200 rows, two joins) is fetched only while a question needs it. The exchange
 * stays on screen after the pipeline goes idle: the assistant keeps its answer until the director
 * asks again, taps the face, or closes it; an understood question frees the pipeline at once.
 */
export function useQuestionExchange({
  stage,
  question,
  requestId,
  resetIngest,
  userId,
  rows,
  lanes,
  now,
  people,
  peopleLoading,
}: {
  stage: IngestStage;
  question: string | null;
  requestId: string | null;
  resetIngest: () => void;
  userId: string | undefined;
  rows: BoardTask[] | undefined;
  lanes: Lanes;
  now: Date;
  people: PersonRow[] | undefined;
  peopleLoading: boolean;
}): { exchange: Exchange | null; closeExchange: () => void } {
  const asked = stage === "question" && question ? question : null;
  const sent = useSentTasks(asked ? userId : undefined);
  const reply = useMemo(() => {
    if (!asked || !rows || peopleLoading || sent.isLoading) return null;
    return answer(answerInput({ question: asked, now, people: people ?? [], rows, lanes, sent: sent.data ?? [] }));
  }, [asked, now, rows, lanes, peopleLoading, people, sent.isLoading, sent.data]);

  const [exchange, setExchange] = useState<Exchange | null>(null);
  const exchangeKey = asked ? (requestId ?? asked) : null;
  if (asked && reply && exchangeKey && exchange?.key !== exchangeKey) {
    setExchange({ key: exchangeKey, said: asked, lines: reply.lines, understood: reply.understood });
  }
  useEffect(() => {
    if (asked && reply?.understood) resetIngest();
  }, [asked, reply, resetIngest]);
  const closeExchange = useStableCallback(() => {
    setExchange(null);
    if (stage === "question") resetIngest();
  });
  return { exchange, closeExchange };
}
