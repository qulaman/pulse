"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import type { SignedPiece } from "@/lib/ai/evals/stamp";
import { normalizeRules, PARSER_RULES_MAX } from "@/lib/ai/rules";
import type { ParserLabState } from "@/lib/lab/parser";
import type { ParserRulesVersion } from "@/lib/settings";
import { PARSER_MODELS } from "@/lib/settings-plain";

import { ClearRulesSheet } from "./ClearRulesSheet";
import { RunPanel } from "./RunPanel";
import { ApiFailure, call, COMPANY_RUN, companyRunHint, FIELD, modelName, when } from "./shared";
import { useCorpusRun } from "./useCorpusRun";

/**
 * «Правила компании»: the draft on top of the core prompt, the model to run it on, the corpus run,
 * and «Сохранить» — open only for a run of exactly this text on the company's model that passed.
 */
export function RulesCard({
  state,
  draft,
  setDraft,
  runKey,
  setRunKey,
}: {
  state: ParserLabState;
  draft: string;
  setDraft: (text: string | null) => void;
  runKey: string;
  setRunKey: (key: string) => void;
}) {
  const queryClient = useQueryClient();
  const active = state.versions[0] ?? null;
  const activeText = active?.text ?? "";
  const text = normalizeRules(draft);
  const changed = text !== activeText;
  const corpus = useCorpusRun({ state, text, runKey, changed });
  const run = corpus.current;
  const clearRequestId = useRef<string>("");
  const [confirmClear, setConfirmClear] = useState(false);

  const save = useMutation({
    mutationFn: (payload: { text: string; pieces: SignedPiece[]; client_request_id: string }) =>
      call<{ versions: ParserRulesVersion[] }>("/api/lab/parser", {
        method: "PUT",
        body: JSON.stringify({ ...payload, base_version: active?.version ?? 0 }),
      }),
    onSuccess: ({ versions }) => {
      const head = versions[0];
      toast(head && head.text ? `Сохранил правила, версия ${head.version}` : "Убрал правила — разбор идёт по ядру");
      setDraft(null);
      corpus.forget();
      setConfirmClear(false);
      void queryClient.invalidateQueries({ queryKey: ["lab", "parser"] });
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : "Не получилось сохранить. Попробуй ещё раз");
      // the rules moved under the page: show what is in force now
      if (error instanceof ApiFailure && (error.code === "conflict" || error.code === "unchanged")) {
        setConfirmClear(false);
        void queryClient.invalidateQueries({ queryKey: ["lab", "parser"] });
      }
    },
  });

  const savedAt = active ? when(active.saved_at) : null;
  const status =
    active && active.text
      ? `Действует версия ${active.version}${active.saved_by_name ? ` · ${active.saved_by_name}` : ""}${savedAt ? ` · ${savedAt}` : ""}`
      : "Своих правил нет — разбор идёт по ядру промпта";
  // the gate passed on one model; the company may have switched since (D-138)
  const checkedElsewhere = active?.text && active.eval && active.eval.model !== state.parser.model ? active.eval.model : null;

  return (
    <section className="card p-4">
      <h2 className="text-[19px] font-semibold leading-6">Правила компании</h2>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Дописываются в конец промпта после правил ядра. Ядро — типы сущностей, безопасность и формат ответа — правится только в коде.
      </p>
      <p className="mt-3 text-[14px] leading-5" data-testid="parser-rules-status">{status}</p>
      {checkedElsewhere ? (
        <p className="mt-1 text-[13px] leading-[18px] text-warn">
          Проверены на {modelName(checkedElsewhere)}, а разбор теперь идёт на {modelName(state.parser.model)} — стоит прогнать корпус заново.
        </p>
      ) : null}

      <textarea
        className={`${FIELD} mt-3 min-h-[180px]`}
        value={draft}
        maxLength={PARSER_RULES_MAX}
        placeholder={"Например:\n«Склад» — это всегда Тимур, если имя не названо.\n«До планёрки» — 09:30 названного дня."}
        onChange={(e) => setDraft(e.target.value)}
        data-testid="parser-rules-draft"
        aria-label="Правила компании"
      />
      <div className="mt-1 flex items-center justify-between gap-3 text-[12px] leading-4 text-muted">
        <span className="nums">
          {draft.length} / {PARSER_RULES_MAX}
        </span>
        {changed ? (
          <button type="button" className="min-h-[36px] font-medium text-accent" onClick={() => setDraft(null)}>
            Вернуть действующие
          </button>
        ) : null}
      </div>

      <label className="mt-3 flex flex-col gap-2">
        <span className="text-[14px] font-medium leading-[18px] text-muted">Модель прогона</span>
        <select className={`${FIELD} min-h-[44px] py-0`} value={runKey} onChange={(e) => setRunKey(e.target.value)} data-testid="parser-run-model">
          <option value={COMPANY_RUN}>Как в компании</option>
          {PARSER_MODELS.map((m) => (
            <option key={m} value={m}>
              Сравнить с {modelName(m)}
            </option>
          ))}
        </select>
        <span className="text-[13px] leading-4 text-muted">
          {runKey === COMPANY_RUN ? companyRunHint(state.parser) : "Только эта модель, без перепроверки. Такой прогон — для сравнения, сохранить его нельзя"}
        </span>
      </label>

      <div className="mt-4 flex flex-col gap-3">
        <RunPanel
          state={state}
          run={run}
          done={corpus.done}
          metrics={corpus.metrics}
          runKey={runKey}
          active={active}
          onStart={() => void corpus.start()}
          onStop={corpus.stop}
        />

        {changed && text !== "" ? (
          <div className="flex flex-col gap-1.5">
            <Button
              block
              disabled={!corpus.canSave || save.isPending}
              loading={save.isPending}
              onClick={() => run && save.mutate({ text, pieces: run.pieces, client_request_id: run.requestId })}
              data-testid="parser-save"
            >
              Сохранить правила
            </Button>
            {!corpus.done || runKey !== COMPANY_RUN ? (
              <p className="text-center text-[13px] leading-4 text-muted" data-testid="parser-save-hint">
                Сохраню после прогона этого текста на модели компании
              </p>
            ) : null}
          </div>
        ) : null}

        {activeText ? (
          <Button
            block
            variant="ghost"
            onClick={() => {
              clearRequestId.current = crypto.randomUUID();
              setConfirmClear(true);
            }}
            data-testid="parser-clear"
          >
            Убрать правила компании
          </Button>
        ) : null}
      </div>

      <ClearRulesSheet
        open={confirmClear}
        pending={save.isPending}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => save.mutate({ text: "", pieces: [], client_request_id: clearRequestId.current })}
      />
    </section>
  );
}
