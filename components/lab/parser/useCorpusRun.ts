"use client";

import { useRef, useState } from "react";

import { passesGates, summarize, type CaseResult } from "@/lib/ai/evals/score";
import type { SignedPiece } from "@/lib/ai/evals/stamp";
import { EVAL_PARALLEL, piecesOf, type ParserLabState } from "@/lib/lab/parser";

import { call, COMPANY_RUN, runOf } from "./shared";

export interface CorpusRun {
  /** The normalized text the run is for — a different draft makes it someone else's run. */
  text: string;
  runKey: string;
  /** The company's model switches at the start: switched since — the run no longer saves. */
  config: string;
  /** One save attempt of this run: a retry after a lost answer is the same save (principle 7). */
  requestId: string;
  total: number;
  pieces: SignedPiece[];
  results: CaseResult[];
  cost: number | null;
  running: boolean;
  error: string | null;
}

/**
 * The draft run on the whole corpus, a few signed pieces at a time. `current` — the run of exactly
 * this text, model and company switches, or null; `canSave` — it is done on the company's model,
 * the text is new and the gates passed.
 */
export function useCorpusRun({ state, text, runKey, changed }: { state: ParserLabState; text: string; runKey: string; changed: boolean }) {
  const [run, setRun] = useState<CorpusRun | null>(null);
  const abort = useRef<AbortController | null>(null);
  const config = JSON.stringify(state.parser);

  const current = run !== null && run.text === text && run.runKey === runKey && (runKey !== COMPANY_RUN || run.config === config) ? run : null;
  const done = current !== null && !current.running && current.error === null && current.results.length === current.total;
  const metrics = current !== null && current.results.length > 0 ? summarize(current.results) : null;
  const canSave = done && runKey === COMPANY_RUN && changed && text !== "" && metrics !== null && passesGates(metrics);

  const start = async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const chunks = piecesOf(state.corpus.cases.map((c) => c.id));
    const fresh: CorpusRun = {
      text,
      runKey,
      config,
      requestId: crypto.randomUUID(),
      total: state.corpus.cases.length,
      pieces: [],
      results: [],
      cost: 0,
      running: true,
      error: null,
    };
    setRun(fresh);

    let next = 0;
    let failure: string | null = null;
    const sendPiece = async (ids: string[]): Promise<SignedPiece> => {
      const body = JSON.stringify({ rules: text, ids, run: runOf(runKey) });
      try {
        return await call<SignedPiece>("/api/lab/parser/eval", { method: "POST", body, signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) throw error;
        // one more try: a piece is cheap, a whole run started over is not
        return call<SignedPiece>("/api/lab/parser/eval", { method: "POST", body, signal: controller.signal });
      }
    };
    const worker = async () => {
      while (next < chunks.length && failure === null && !controller.signal.aborted) {
        const ids = chunks[next++];
        try {
          const piece = await sendPiece(ids);
          const parsed = JSON.parse(piece.payload) as { results: CaseResult[]; cost_usd: number | null };
          // only into this very run: a newer one started meanwhile keeps its own
          setRun((prev) =>
            prev && prev.requestId === fresh.requestId && prev.running
              ? {
                  ...prev,
                  pieces: [...prev.pieces, piece],
                  results: [...prev.results, ...parsed.results],
                  cost: prev.cost === null || parsed.cost_usd === null ? null : prev.cost + parsed.cost_usd,
                }
              : prev,
          );
        } catch (error) {
          if (!controller.signal.aborted) failure = error instanceof Error ? error.message : "Не получилось прогнать корпус";
        }
      }
    };
    await Promise.all(Array.from({ length: EVAL_PARALLEL }, worker));
    if (controller.signal.aborted) return;
    setRun((prev) => (prev && prev.requestId === fresh.requestId ? { ...prev, running: false, error: failure } : prev));
  };

  const stop = () => {
    abort.current?.abort();
    setRun((prev) => (prev ? { ...prev, running: false, error: "Остановил прогон" } : prev));
  };

  /** Saved or cleared: the run is spent. */
  const forget = () => setRun(null);

  return { current, done, metrics, canSave, start, stop, forget };
}
