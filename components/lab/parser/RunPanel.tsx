import { Button } from "@/components/ui/Button";
import { passesGates, type EvalMetrics } from "@/lib/ai/evals/score";
import { pct, usd } from "@/lib/lab/format";
import type { ParserLabState } from "@/lib/lab/parser";
import type { ParserRulesVersion } from "@/lib/settings";

import { FailedCases, Metrics } from "./parts";
import { COMPANY_RUN } from "./shared";
import type { CorpusRun } from "./useCorpusRun";

/**
 * The corpus run under the draft: the button or the progress with «Остановить», then the gates,
 * the cost, the active version's figures and the phrases that failed.
 */
export function RunPanel({
  state,
  run,
  done,
  metrics,
  runKey,
  active,
  onStart,
  onStop,
}: {
  state: ParserLabState;
  /** The run of this very draft and model, or null. */
  run: CorpusRun | null;
  done: boolean;
  metrics: EvalMetrics | null;
  runKey: string;
  active: ParserRulesVersion | null;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <>
      {run?.running ? (
        <div className="flex flex-col gap-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div
              className="h-full origin-left rounded-full bg-accent transition-transform duration-300"
              style={{ transform: `scaleX(${run.results.length / Math.max(run.total, 1)})` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="nums text-[14px] leading-5 text-muted" data-testid="parser-run-progress">
              Прогоняю корпус: {run.results.length} из {run.total}
            </span>
            <Button variant="ghost" size="sm" onClick={onStop}>
              Остановить
            </Button>
          </div>
        </div>
      ) : (
        <Button block variant="secondary" onClick={onStart} data-testid="parser-run">
          {run ? "Проверить ещё раз" : `Проверить на корпусе (${state.corpus.cases.length} фраз)`}
        </Button>
      )}

      {run && metrics ? (
        <div className="flex flex-col gap-2 rounded-[14px] border border-border p-3" data-testid="parser-run-result">
          <Metrics metrics={metrics} gates={state.gates} />
          <p className="nums text-[12px] leading-4 text-muted">
            {run.results.length} из {run.total} фраз · не прошли {metrics.failed} · перепроверок {metrics.escalated} · {usd(run.cost)}
          </p>
          {active?.eval && active.text ? (
            <p className="nums text-[12px] leading-4 text-muted">
              У действующей версии: исполнитель {pct(active.eval.assignee)}, F1 {pct(active.eval.f1)}, сроки {pct(active.eval.deadline)}
            </p>
          ) : null}
          {run.error ? <p className="text-[13px] leading-[18px] text-danger">{run.error}</p> : null}
          {done && runKey !== COMPANY_RUN ? (
            <p className="text-[13px] leading-[18px] text-muted">Это сравнение. Сохранить можно только прогон на модели компании.</p>
          ) : null}
          {done && runKey === COMPANY_RUN && !passesGates(metrics) ? (
            <p className="text-[13px] leading-[18px] text-danger">Ниже порога — такие правила я не сохраню.</p>
          ) : null}
          <FailedCases results={run.results} corpus={state.corpus} />
        </div>
      ) : run?.error ? (
        <p className="text-[13px] leading-[18px] text-danger">{run.error}</p>
      ) : null}
    </>
  );
}
