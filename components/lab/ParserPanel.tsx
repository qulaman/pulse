"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { Sheet } from "@/components/ui/Sheet";
import { SectionBone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { passesGates, summarize, type CaseResult, type EvalMetrics } from "@/lib/ai/evals/score";
import type { SignedPiece } from "@/lib/ai/evals/stamp";
import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import { normalizeRules, PARSER_RULES_MAX } from "@/lib/ai/rules";
import {
  EVAL_PARALLEL,
  piecesOf,
  type ParserLabState,
  type RunModel,
  type TryResponse,
  type TrySide,
} from "@/lib/lab/parser";
import { pct, usd, whenAqtobe } from "@/lib/lab/format";
import type { ParserRulesVersion } from "@/lib/settings";
// labels only — lib/settings.ts itself would bring zod into this page (D-126)
import { PARSER_MODEL_SHORT, PARSER_MODELS } from "@/lib/settings-plain";

/**
 * «Парсер» in the lab (D-138): the company's own rules on top of the core prompt. A draft is
 * tried on a phrase, then on the whole corpus; it is saved only when the run of exactly that
 * text on the company's model passed the gates — the server checks the signed run again.
 * Below — what the model sees, and the versions to take back into the draft.
 */

const FIELD =
  "w-full field px-3 py-2.5 text-[16px] leading-[22px] text-text outline-none focus:border-accent";

const COMPANY_RUN = "company";

class ApiFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: { code: string; message_ru: string } }) | null;
  if (!res.ok || !body) throw new ApiFailure(body?.error?.code ?? "internal", body?.error?.message_ru ?? "Не получилось. Попробуй ещё раз");
  return body;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} с`;
}

/** A model's date may be missing or broken — then no date, not «Invalid Date». */
function when(iso: string | null): string | null {
  return iso && !Number.isNaN(Date.parse(iso)) ? whenAqtobe(iso) : null;
}

function modelName(model: string): string {
  return PARSER_MODEL_SHORT[model] ?? model;
}

function companyRunHint(parser: ParserLabState["parser"]): string {
  return parser.escalate
    ? `В компании: ${modelName(parser.model)}, перепроверка — ${modelName(parser.escalation_model)}`
    : `В компании: ${modelName(parser.model)}, без перепроверки`;
}

/** «company» — the company's switches; a model id — that model alone, without a second opinion. */
function runOf(key: string): RunModel | undefined {
  return key === COMPANY_RUN ? undefined : { model: key, escalate: false, escalation_model: key };
}

// ---------------------------------------------------------------------------------------
// entities, one line each

const KIND: Record<string, string> = {
  task: "Задача",
  announcement: "Объявление",
  points: "Очки",
  reminder: "Напоминание",
  note: "Заметка",
  event: "Мероприятие",
  recurrence: "Повтор",
  delegation: "Поручение группе",
  query: "Вопрос",
};

function who(entity: PostprocessedEntity): { text: string; tone: "ok" | "warn" | "danger" } | null {
  if (!("assignee_id" in entity)) return null;
  const match = entity.assignee;
  const name = entity.assignee_name;
  if (match?.status === "matched" && name) return { text: name, tone: match.flag === "ok" ? "ok" : "warn" };
  if (entity.assignee_queries.length > 0) return { text: `Кому? «${entity.assignee_queries.join(", ")}»`, tone: "danger" };
  return { text: "Кому?", tone: "danger" };
}

function gist(entity: PostprocessedEntity): string {
  switch (entity.kind) {
    case "task": {
      const due = when(entity.deadline_iso);
      return [entity.title, due ? `до ${due}` : null, entity.priority === "high" ? "срочно" : null].filter(Boolean).join(" · ");
    }
    case "points":
      return `${entity.amount > 0 ? "+" : ""}${entity.amount}${entity.reason ? ` — ${entity.reason}` : ""}`;
    case "reminder": {
      const at = when(entity.remind_at_iso);
      return at ? `${entity.text} · ${at}` : entity.text;
    }
    case "event": {
      const at = when(entity.starts_at_iso);
      const people = entity.everyone ? "всем" : entity.participant_names.join(", ");
      return [entity.title, at, people || null, entity.location || null].filter(Boolean).join(" · ");
    }
    case "recurrence":
      return `${entity.title} · ${entity.rrule}`;
    case "delegation":
      return entity.title;
    case "query":
      return entity.question;
    default:
      return entity.text;
  }
}

const TONE_CLASS = { ok: "text-ok", warn: "text-warn", danger: "text-danger" } as const;

const BLOCKED: Record<NonNullable<PostprocessedEntity["blocked"]>, string> = {
  assignee_unmatched: "не уйдёт, пока не выбран исполнитель",
  points_blocked: "очки из пересланного текста не начисляю",
  time_missing: "не уйдёт без времени",
};

function EntityList({ entities }: { entities: PostprocessedEntity[] }) {
  if (entities.length === 0) return <p className="text-[14px] leading-5 text-muted">Ничего не извлёк</p>;
  return (
    <ul className="flex flex-col gap-2">
      {entities.map((entity, index) => {
        const person = who(entity);
        return (
          <li key={index} className="rounded-[12px] bg-surface-2 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2 text-[12px] leading-4">
              <span className="font-semibold uppercase tracking-[0.04em] text-muted">{KIND[entity.kind] ?? entity.kind}</span>
              {person ? <span className={`truncate font-medium ${TONE_CLASS[person.tone]}`}>{person.text}</span> : null}
            </div>
            <p className="mt-0.5 text-[14px] leading-5">{gist(entity)}</p>
            {entity.blocked ? <p className="mt-0.5 text-[12px] leading-4 text-warn">{BLOCKED[entity.blocked] ?? entity.blocked}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

function SideResult({ title, side }: { title: string; side: TrySide }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="eyebrow">{title}</h3>
      {side.ok ? (
        <>
          <p className="nums text-[12px] leading-4 text-muted">
            {modelName(side.model)}
            {side.escalated ? " · перепроверено" : ""} · {seconds(side.latency_ms)} · {usd(side.cost_usd)} · вход {side.tokens.input.toLocaleString("ru-RU")}
            {side.tokens.cache_read ? `, из кэша ${side.tokens.cache_read.toLocaleString("ru-RU")}` : ""} · выход {side.tokens.output.toLocaleString("ru-RU")}
          </p>
          <EntityList entities={side.entities} />
        </>
      ) : (
        <p className="text-[14px] leading-5 text-danger">{side.error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// the corpus run

interface CorpusRun {
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

function GateLine({ label, value, gate }: { label: string; value: number; gate?: number }) {
  const ok = gate === undefined ? null : value >= gate;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[14px] leading-5 text-muted">
        {label}
        {gate !== undefined ? <span className="nums"> · порог {pct(gate)}</span> : " · без порога"}
      </span>
      <span className={`nums text-[17px] font-semibold leading-[22px] ${ok === null ? "" : ok ? "text-ok" : "text-danger"}`}>{pct(value)}</span>
    </div>
  );
}

function Metrics({ metrics, gates }: { metrics: EvalMetrics; gates: ParserLabState["gates"] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <GateLine label="Исполнитель" value={metrics.assignee} gate={gates.assignee} />
      <GateLine label="Сущности, F1" value={metrics.f1} gate={gates.f1} />
      <GateLine label="Сроки" value={metrics.deadline} />
    </div>
  );
}

function FailedCases({ results, corpus }: { results: CaseResult[]; corpus: ParserLabState["corpus"] }) {
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) return null;
  const transcript = new Map(corpus.cases.map((c) => [c.id, c.transcript]));
  return (
    <details className="group">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-[14px] font-medium leading-5">
        Не прошли: {failed.length}
        <span aria-hidden className="text-muted transition-transform duration-[120ms] group-open:rotate-90">›</span>
      </summary>
      <ul className="flex flex-col divide-y divide-border">
        {failed.map((r) => (
          <li key={r.id} className="py-2 text-[13px] leading-[18px]">
            <span className="nums font-semibold">{r.id}</span>
            <span className="text-muted"> · {transcript.get(r.id) ?? ""}</span>
            {(r.error ? [r.error] : r.failures).map((f, i) => (
              <span key={i} className="block text-danger">{f}</span>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------------------

function RulesCard({
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

  const [run, setRun] = useState<CorpusRun | null>(null);
  const abort = useRef<AbortController | null>(null);
  const clearRequestId = useRef<string>("");
  const [confirmClear, setConfirmClear] = useState(false);
  const config = JSON.stringify(state.parser);

  const runIsCurrent = run !== null && run.text === text && run.runKey === runKey && (runKey !== COMPANY_RUN || run.config === config);
  const done = runIsCurrent && !run.running && run.error === null && run.results.length === run.total;
  const metrics = runIsCurrent && run.results.length > 0 ? summarize(run.results) : null;
  const canSave = done && runKey === COMPANY_RUN && changed && text !== "" && metrics !== null && passesGates(metrics);

  const startRun = async () => {
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

  const stopRun = () => {
    abort.current?.abort();
    setRun((prev) => (prev ? { ...prev, running: false, error: "Остановил прогон" } : prev));
  };

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
      setRun(null);
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

  const status = active && active.text
    ? `Действует версия ${active.version}${active.saved_by_name ? ` · ${active.saved_by_name}` : ""}${when(active.saved_at) ? ` · ${when(active.saved_at)}` : ""}`
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
        {runIsCurrent && run.running ? (
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
              <Button variant="ghost" size="sm" onClick={stopRun}>
                Остановить
              </Button>
            </div>
          </div>
        ) : (
          <Button block variant="secondary" onClick={() => void startRun()} data-testid="parser-run">
            {runIsCurrent ? "Проверить ещё раз" : `Проверить на корпусе (${state.corpus.cases.length} фраз)`}
          </Button>
        )}

        {runIsCurrent && metrics ? (
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
        ) : runIsCurrent && run.error ? (
          <p className="text-[13px] leading-[18px] text-danger">{run.error}</p>
        ) : null}

        {changed && text !== "" ? (
          <div className="flex flex-col gap-1.5">
            <Button
              block
              disabled={!canSave || save.isPending}
              loading={save.isPending}
              onClick={() => runIsCurrent && save.mutate({ text, pieces: run.pieces, client_request_id: run.requestId })}
              data-testid="parser-save"
            >
              Сохранить правила
            </Button>
            {!done || runKey !== COMPANY_RUN ? (
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

      <Sheet open={confirmClear} onClose={() => setConfirmClear(false)} title="Убрать правила компании?">
        <p className="text-[15px] leading-[22px] text-muted">
          Разбор вернётся к ядру промпта — тому, что проверяет корпус в репозитории. Прогон для этого не нужен. Текст останется в истории версий.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button block variant="danger" loading={save.isPending} onClick={() => save.mutate({ text: "", pieces: [], client_request_id: clearRequestId.current })} data-testid="parser-clear-confirm">
            Убрать
          </Button>
          <Button block variant="ghost" onClick={() => setConfirmClear(false)}>
            Оставить
          </Button>
        </div>
      </Sheet>
    </section>
  );
}

function SandboxCard({ draft, runKey, activeText }: { draft: string; runKey: string; activeText: string }) {
  const [phrase, setPhrase] = useState("");
  const tryIt = useMutation({
    mutationFn: () =>
      call<TryResponse>("/api/lab/parser/try", {
        method: "POST",
        body: JSON.stringify({ transcript: phrase, rules: draft, compare: true, run: runOf(runKey) }),
      }),
    onError: (error) => toast(error instanceof Error ? error.message : "Не получилось разобрать"),
  });
  const result = tryIt.data;
  const sameRules = normalizeRules(draft) === activeText;

  return (
    <section className="card p-4">
      <h2 className="text-[19px] font-semibold leading-6">Песочница</h2>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Фраза разбирается как написанная директором: ваш ростер, слова о сроках и {sameRules ? "действующие правила" : "черновик рядом с действующими правилами"}. Ничего не отправляю и не сохраняю.
      </p>
      <textarea
        className={`${FIELD} mt-3 min-h-[88px]`}
        value={phrase}
        maxLength={2000}
        placeholder="Марат, подготовь КП по Альфе к пятнице"
        onChange={(e) => setPhrase(e.target.value)}
        data-testid="parser-try-phrase"
        aria-label="Фраза для разбора"
      />
      <Button
        block
        className="mt-3"
        disabled={phrase.trim() === ""}
        loading={tryIt.isPending}
        onClick={() => tryIt.mutate()}
        data-testid="parser-try"
      >
        Разобрать
      </Button>
      {result ? (
        <div className="mt-4 flex flex-col gap-4" data-testid="parser-try-result">
          <SideResult title={result.current ? "С черновиком" : "Результат"} side={result.draft} />
          {result.current ? <SideResult title="С действующими правилами" side={result.current} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function PromptCard({ state }: { state: ParserLabState }) {
  const { prompt } = state;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="eyebrow mt-2 px-1">Что видит модель</h2>
      <p className="px-1 text-[13px] leading-4 text-muted">
        {prompt.tokens === null ? "Системный текст, ростер и примеры" : `≈ ${prompt.tokens.toLocaleString("ru-RU")} токенов: системный текст, ростер и примеры`} — едут перед каждой фразой. Дата и сама фраза — отдельным сообщением.
      </p>
      <Disclosure
        title="Системный промпт"
        summary={`${prompt.system.length.toLocaleString("ru-RU")} знаков${state.versions[0]?.text ? " · с правилами компании" : ""}`}
      >
        <pre className="no-bar max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-[17px]" data-testid="parser-system-prompt">
          {prompt.system}
        </pre>
      </Disclosure>
      <Disclosure title="Сотрудники" summary={`${prompt.rosterSize} в ростере · отдельный блок под кэш`}>
        <pre className="no-bar max-h-[50vh] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-[17px]">{prompt.roster}</pre>
      </Disclosure>
      <Disclosure title="Примеры" summary={`${prompt.examples.length} пар · правятся в коде с прогоном корпуса`}>
        <ol className="flex flex-col divide-y divide-border">
          {prompt.examples.map((example, index) => (
            <li key={index} className="py-3 first:pt-0 last:pb-0">
              <p className="whitespace-pre-wrap text-[13px] leading-[18px]">{example.user}</p>
              <details className="mt-1">
                <summary className="min-h-[36px] cursor-pointer text-[13px] font-medium leading-[36px] text-accent">Ответ модели</summary>
                <pre className="no-bar max-h-[40vh] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-[17px] text-muted">{example.answer}</pre>
              </details>
            </li>
          ))}
        </ol>
      </Disclosure>
      <div className="card flex flex-col divide-y divide-border">
        <Link href="/settings?tab=ai" className="flex min-h-[52px] items-center justify-between gap-3 px-4">
          <span className="text-[15px] leading-5">Модели и слова о сроках</span>
          <span aria-hidden className="text-[18px] text-muted">›</span>
        </Link>
        <Link href="/settings/dictionary" className="flex min-h-[52px] items-center justify-between gap-3 px-4">
          <span className="text-[15px] leading-5">Словарь имён и слов</span>
          <span aria-hidden className="text-[18px] text-muted">›</span>
        </Link>
      </div>
    </div>
  );
}

function HistoryCard({ versions, onTake }: { versions: ParserRulesVersion[]; onTake: (text: string) => void }) {
  if (versions.length === 0) return null;
  return (
    <section className="card p-4">
      <h2 className="text-[19px] font-semibold leading-6">Версии</h2>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        {versions.length === 1 ? "Пока одна." : `Последние ${versions.length}.`} Вернуть старую — взять её в черновик, проверить и сохранить.
      </p>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {versions.map((v, index) => (
          <li key={v.version} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="nums text-[13px] font-semibold leading-[18px]">
                Версия {v.version}
                {index === 0 ? <span className="text-ok"> · действует</span> : null}
              </span>
              <span className="nums shrink-0 text-[12px] leading-4 text-muted">{when(v.saved_at)}</span>
            </div>
            <p className="mt-0.5 text-[12px] leading-4 text-muted">
              {v.saved_by_name ?? "—"}
              {v.eval ? ` · исполнитель ${pct(v.eval.assignee)}, F1 ${pct(v.eval.f1)}, ${modelName(v.eval.model)}` : ""}
            </p>
            {v.text ? (
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[13px] leading-[18px]">{v.text}</p>
            ) : (
              <p className="mt-1 text-[13px] leading-[18px] text-muted">Правила убраны — разбор по ядру</p>
            )}
            {index > 0 && v.text ? (
              <Button variant="ghost" size="sm" className="mt-1 -ml-3" onClick={() => onTake(v.text)}>
                В черновик
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ParserPanel() {
  // under «lab»: the offline snapshot keeps nothing of the lab (lib/offline/persist.ts)
  const query = useQuery({
    queryKey: ["lab", "parser"],
    queryFn: () => call<ParserLabState>("/api/lab/parser"),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const [runKey, setRunKey] = useState(COMPANY_RUN);

  if (!query.data) {
    return (
      <SkeletonGroup className="flex flex-col gap-4">
        <SectionBone fields={3} />
        <SectionBone fields={2} />
      </SkeletonGroup>
    );
  }

  const state = query.data;
  const activeText = state.versions[0]?.text ?? "";
  const text = draft ?? activeText;

  return (
    <div className="flex flex-col gap-4">
      <RulesCard state={state} draft={text} setDraft={setDraft} runKey={runKey} setRunKey={setRunKey} />
      <SandboxCard draft={text} runKey={runKey} activeText={activeText} />
      <PromptCard state={state} />
      <HistoryCard
        versions={state.versions}
        onTake={(taken) => {
          setDraft(taken);
          window.scrollTo({ top: 0, behavior: "smooth" });
          toast("Взял в черновик. Проверь на корпусе и сохрани");
        }}
      />
    </div>
  );
}
