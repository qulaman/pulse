"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { SectionBone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import type { LabCall, LabResponse, LabRow } from "@/lib/lab/rows";
import type { CompanySettings } from "@/lib/settings";
// labels only — lib/settings.ts itself would bring zod into this page (D-126)
import { PARSER_MODEL_LABEL, PARSER_MODELS, STT_PROVIDER_LABEL, STT_PROVIDERS } from "@/lib/settings-plain";

type LabSettings = LabResponse["settings"];

const FIELD =
  "min-h-[44px] w-full field px-3 text-[16px] leading-[22px] text-text outline-none focus:border-accent";

async function fetchLab(): Promise<LabResponse> {
  const res = await fetch("/api/lab", { credentials: "include" });
  if (!res.ok) throw new Error("lab failed");
  return (await res.json()) as LabResponse;
}

async function patchLab(patch: Partial<LabSettings>): Promise<LabSettings> {
  const res = await fetch("/api/lab", {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("save failed");
  return ((await res.json()) as { settings: LabSettings }).settings;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[14px] font-medium leading-[18px] text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
    >
      <span>
        <span className="block text-[16px] leading-[22px]">{label}</span>
        {hint ? <span className="block text-[13px] leading-4 text-muted">{hint}</span> : null}
      </span>
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-[120ms]"
        style={{ background: checked ? "var(--accent)" : "var(--border)" }}
      >
        <span
          className="absolute top-1 h-5 w-5 rounded-full bg-bg transition-transform duration-[120ms]"
          style={{ transform: checked ? "translateX(24px)" : "translateX(4px)" }}
        />
      </span>
    </button>
  );
}

const MODEL_SHORT: Record<string, string> = {
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-sonnet-5": "Sonnet 5",
  "deepseek-chat": "DS chat",
  "deepseek-reasoner": "DS reasoner",
};

function shortModel(model: string): string {
  return MODEL_SHORT[model] ?? model;
}

function usd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "$0";
  return value < 0.001 ? `$${value.toFixed(5)}` : `$${value.toFixed(4)}`;
}

function tokens(value: number): string {
  return value.toLocaleString("ru-RU");
}

function seconds(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? "—" : `${(ms / 1000).toFixed(1)} с`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    timeZone: "Asia/Aqtobe",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ModelStat {
  model: string;
  calls: number;
  input: number;
  cache: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
  ms: number;
  cost: number;
  failed: number;
}

/** Per model across every priced call: the comparison the lab exists for. */
function statsByModel(rows: LabRow[]): ModelStat[] {
  const map = new Map<string, ModelStat>();
  for (const row of rows) {
    for (const call of row.parse.calls) {
      const stat = map.get(call.model) ?? {
        model: call.model,
        calls: 0,
        input: 0,
        cache: 0,
        cacheWrite: 0,
        output: 0,
        reasoning: 0,
        ms: 0,
        cost: 0,
        failed: 0,
      };
      if (call.ok) {
        stat.calls += 1;
        stat.input += call.input_tokens;
        stat.cache += call.cache_read_tokens;
        stat.cacheWrite += call.cache_write_tokens;
        stat.output += call.output_tokens;
        stat.reasoning += call.reasoning_tokens;
        stat.ms += call.latency_ms;
        stat.cost += call.cost ?? 0;
      } else {
        stat.failed += 1;
      }
      map.set(call.model, stat);
    }
  }
  return [...map.values()].sort((a, b) => b.calls - a.calls);
}

function CallLine({ call }: { call: LabCall }) {
  if (!call.ok) {
    return (
      <span className="block text-danger">
        {shortModel(call.model)} · ошибка · {seconds(call.latency_ms)}
      </span>
    );
  }
  return (
    <span className="block">
      <span className="font-medium text-text">{shortModel(call.model)}</span>
      {" · "}
      <span className="nums">
        {tokens(call.input_tokens)} / {tokens(call.cache_read_tokens)} / {tokens(call.output_tokens)}
        {call.cache_write_tokens > 0 ? ` (+${tokens(call.cache_write_tokens)} в кэш)` : ""}
        {call.reasoning_tokens > 0 ? ` (мысли ${tokens(call.reasoning_tokens)})` : ""}
      </span>
      {" · "}
      <span className="nums">{seconds(call.latency_ms)}</span>
      {" · "}
      <span className="nums">{usd(call.cost)}</span>
    </span>
  );
}

function ModelsCard({ settings }: { settings: LabSettings }) {
  const queryClient = useQueryClient();
  const [edited, setEdited] = useState<LabSettings | null>(null);
  const draft = edited ?? settings;

  const save = useMutation({
    mutationFn: patchLab,
    onSuccess: (saved) => {
      queryClient.setQueryData<LabResponse>(["lab"], (prev) => (prev ? { ...prev, settings: saved } : prev));
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setEdited(null);
      toast("Модели переключил");
    },
    onError: () => toast("Не получилось сохранить. Попробуй ещё раз"),
  });

  const update = (patch: Partial<LabSettings>) => setEdited({ ...draft, ...patch });
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(settings);

  return (
    <section className="card p-4">
      <h2 className="text-[19px] font-semibold leading-6">Модели</h2>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Действует на следующее распознавание. Те же настройки компании, что и на вкладке «Настройки».
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <Field label="Распознавание речи (STT)">
          <select
            className={FIELD}
            value={draft.stt.provider}
            onChange={(e) => update({ stt: { ...draft.stt, provider: e.target.value as CompanySettings["stt"]["provider"] } })}
          >
            {STT_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {STT_PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Рассуждения (разбор поручений)">
          <select
            className={FIELD}
            value={draft.parser.model}
            onChange={(e) => update({ parser: { ...draft.parser, model: e.target.value } })}
          >
            {PARSER_MODELS.map((m) => (
              <option key={m} value={m}>
                {PARSER_MODEL_LABEL[m] ?? m}
              </option>
            ))}
          </select>
        </Field>
        <Toggle
          label="Перепроверять сильной моделью"
          hint="Выключи для чистого сравнения: иначе длинные фразы платят и второй модели"
          checked={draft.parser.escalate}
          onChange={(v) => update({ parser: { ...draft.parser, escalate: v } })}
        />
        {draft.parser.escalate ? (
          <Field label="Модель для перепроверки">
            <select
              className={FIELD}
              value={draft.parser.escalation_model}
              onChange={(e) => update({ parser: { ...draft.parser, escalation_model: e.target.value } })}
            >
              {PARSER_MODELS.map((m) => (
                <option key={m} value={m}>
                  {PARSER_MODEL_LABEL[m] ?? m}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Button block disabled={!dirty || save.isPending} onClick={() => save.mutate({ stt: draft.stt, parser: draft.parser })}>
          {save.isPending ? "Сохраняю…" : "Применить"}
        </Button>
      </div>
    </section>
  );
}

function SummaryCard({ rows }: { rows: LabRow[] }) {
  const stats = statsByModel(rows);
  if (stats.length === 0) return null;
  return (
    <section className="card p-4">
      <h2 className="text-[19px] font-semibold leading-6">По моделям</h2>
      <p className="mt-1 text-[13px] leading-4 text-muted">Среднее на один вызов по строкам ниже. Токены: вход / из кэша / выход; запись в кэш — отдельно, она дороже входа.</p>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {stats.map((s) => (
          <li key={s.model} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <div className="text-[15px] font-semibold leading-5">
                {shortModel(s.model)}
                <span className="nums font-normal text-muted"> · {s.calls} выз.</span>
                {s.failed > 0 ? <span className="text-danger"> · {s.failed} ош.</span> : null}
              </div>
              <div className="nums mt-0.5 text-[12px] leading-4 text-muted">
                {s.calls
                  ? `${tokens(Math.round(s.input / s.calls))} / ${tokens(Math.round(s.cache / s.calls))} / ${tokens(Math.round(s.output / s.calls))} ток.`
                  : "—"}
                {s.cacheWrite > 0 && s.calls ? ` (+${tokens(Math.round(s.cacheWrite / s.calls))} в кэш)` : ""}
                {s.reasoning > 0 && s.calls ? ` (мысли ${tokens(Math.round(s.reasoning / s.calls))})` : ""}
                {s.calls ? ` · ${seconds(s.ms / s.calls)}` : ""}
              </div>
            </div>
            <div className="nums shrink-0 text-right">
              <div className="text-[15px] font-semibold leading-5">{s.calls ? usd(s.cost / s.calls) : "—"}</div>
              <div className="text-[12px] leading-4 text-muted">всего {usd(s.cost)}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RowsTable({ rows }: { rows: LabRow[] }) {
  return (
    <section className="card p-4">
      <h2 className="text-[19px] font-semibold leading-6">Расходы по распознаваниям</h2>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Последние {rows.length} разборов директора, новые сверху. Строка разбора: модель · вход / из кэша / выход · время · цена.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-[14px] leading-5 text-muted">Пока ни одного распознавания — надиктуй или напиши поручение.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="nums text-[12px] leading-4 text-muted">
                  {when(row.created_at)} · {row.source ?? "?"}
                  {row.parse.escalated ? " · эскалация" : ""}
                  {row.status !== "ok" ? <span className="text-danger"> · {row.status}</span> : null}
                </span>
                <span className="nums shrink-0 text-[15px] font-semibold leading-5">{usd(row.total_cost)}</span>
              </div>
              <p className="mt-0.5 truncate text-[14px] leading-5" title={row.transcript ?? ""}>
                {row.transcript ?? "—"}
              </p>
              <div className="mt-1 text-[12px] leading-4 text-muted">
                {row.stt ? (
                  <span className="block">
                    <span className="font-medium text-text">STT {row.stt.model}</span>
                    <span className="nums">
                      {" · "}
                      {row.stt.duration_ms ? `${(row.stt.duration_ms / 1000).toFixed(0)} с аудио · ` : ""}
                      {seconds(row.stt.stt_ms)} · {usd(row.stt.cost)}
                    </span>
                  </span>
                ) : (
                  <span className="block">текст, без STT</span>
                )}
                {row.parse.calls.length === 0 ? (
                  <span className="block">{shortModel(row.parse.model)} · без ответа</span>
                ) : (
                  row.parse.calls.map((call, i) => <CallLine key={i} call={call} />)
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LabPanel() {
  const query = useQuery({ queryKey: ["lab"], queryFn: fetchLab, refetchInterval: 15_000 });

  if (!query.data) {
    return (
      <SkeletonGroup className="flex flex-col gap-4">
        <SectionBone fields={3} />
        <SectionBone fields={2} />
      </SkeletonGroup>
    );
  }

  const { settings, rows, prices } = query.data;
  return (
    <div className="flex flex-col gap-4">
      <ModelsCard settings={settings} />
      <SummaryCard rows={rows} />
      <RowsTable rows={rows} />
      <p className="text-[12px] leading-4 text-muted">
        Цены за 1M токенов (вход / кэш / выход):{" "}
        {Object.entries(prices.models)
          .map(([m, p]) => `${shortModel(m)} $${p.input} / $${p.cacheRead} / $${p.output}`)
          .join("; ")}
        . STT — за минуту аудио: {Object.entries(prices.stt_per_minute).map(([p, v]) => `${p} $${v}`).join(", ")}.
        Без длительности записи цена STT не считается.
      </p>
    </div>
  );
}
