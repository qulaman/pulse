import type { CaseResult, EvalMetrics } from "@/lib/ai/evals/score";
import type { PostprocessedEntity } from "@/lib/ai/postprocess";
import { pct, usd } from "@/lib/lab/format";
import type { ParserLabState, TrySide } from "@/lib/lab/parser";
import { describeRule, EVENT_REPEAT_LABEL } from "@/lib/recurrence/schedule";

import { modelName, seconds, when } from "./shared";

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
      const repeat = entity.repeat !== "none" ? EVENT_REPEAT_LABEL[entity.repeat].toLowerCase() : null;
      return [entity.title, at, people || null, entity.location || null, repeat].filter(Boolean).join(" · ");
    }
    case "recurrence":
      return `${entity.title} · ${describeRule(entity)} · к ${entity.due_time}`;
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

export function EntityList({ entities }: { entities: PostprocessedEntity[] }) {
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

/** One side of the sandbox: the model, its time, cost and tokens, and what it took out of the phrase. */
export function SideResult({ title, side }: { title: string; side: TrySide }) {
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
// the corpus run's result

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

export function Metrics({ metrics, gates }: { metrics: EvalMetrics; gates: ParserLabState["gates"] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <GateLine label="Исполнитель" value={metrics.assignee} gate={gates.assignee} />
      <GateLine label="Сущности, F1" value={metrics.f1} gate={gates.f1} />
      <GateLine label="Сроки" value={metrics.deadline} />
    </div>
  );
}

export function FailedCases({ results, corpus }: { results: CaseResult[]; corpus: ParserLabState["corpus"] }) {
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
