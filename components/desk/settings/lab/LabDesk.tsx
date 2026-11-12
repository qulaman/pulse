"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SelectInput, SettingRow, SettingsGroup, Switch } from "@/components/desk/settings/form";
import { DataGrid, type Column } from "@/components/desk/ui/DataGrid";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { CostReport } from "@/components/lab/CostReport";
import { KeepChip, useRecordings } from "@/components/lab/KeepChip";
import { ParserPanel } from "@/components/lab/ParserPanel";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { useApplyLabModels, useLabBench, useLabForAll, type LabSettings } from "@/lib/desk/settings-queries";
import { usd, whenAqtobe } from "@/lib/lab/format";
import type { LabCall, LabRow } from "@/lib/lab/rows";
import { LAB_TABS, type LabTab } from "@/lib/lab/tabs";
import { PARSER_MODEL_LABEL, PARSER_MODELS, STT_PROVIDER_LABEL, STT_PROVIDERS } from "@/lib/settings-plain";
import { useMe } from "@/lib/tasks/queries";

const TITLES: Record<LabTab, string> = { models: "Модели", parser: "Парсер", costs: "Себестоимость" };

/** The lab's pages for anyone who gets in — explainers, opened beside the desk. */
const SHELF: { href: string; title: string }[] = [
  { href: "/lab/about", title: "Как работает Pulse" },
  { href: "/lab/tech", title: "Технология" },
  { href: "/lab/mascot", title: "Анимации маскота" },
  { href: "/lab/haptics", title: "Вибрация" },
];

const MODEL_SHORT: Record<string, string> = {
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-sonnet-5": "Sonnet 5",
  "deepseek-chat": "DS chat",
  "deepseek-reasoner": "DS reasoner",
};
const short = (model: string) => MODEL_SHORT[model] ?? model;
const tokens = (value: number) => Math.round(value).toLocaleString("ru-RU");
const seconds = (ms: number | null | undefined) => (ms === null || ms === undefined ? "—" : `${(ms / 1000).toFixed(1)} с`);

type ModelStat = { model: string; calls: number; failed: number; input: number; cache: number; cacheWrite: number; output: number; reasoning: number; ms: number; cost: number };

/** Per model across every priced call: the comparison the lab exists for. */
function statsByModel(rows: LabRow[]): ModelStat[] {
  const map = new Map<string, ModelStat>();
  for (const row of rows) {
    for (const call of row.parse.calls) {
      const stat = map.get(call.model) ?? { model: call.model, calls: 0, failed: 0, input: 0, cache: 0, cacheWrite: 0, output: 0, reasoning: 0, ms: 0, cost: 0 };
      if (call.ok) {
        stat.calls += 1;
        stat.input += call.input_tokens;
        stat.cache += call.cache_read_tokens;
        stat.cacheWrite += call.cache_write_tokens;
        stat.output += call.output_tokens;
        stat.reasoning += call.reasoning_tokens;
        stat.ms += call.latency_ms;
        stat.cost += call.cost ?? 0;
      } else stat.failed += 1;
      map.set(call.model, stat);
    }
  }
  return [...map.values()].sort((a, b) => b.calls - a.calls);
}

/** The models the company runs, as settings rows; «Применить» writes them for the next recognition. */
function ModelsForm({ settings }: { settings: LabSettings }) {
  const apply = useApplyLabModels();
  const [edited, setEdited] = useState<LabSettings | null>(null);
  const draft = edited ?? settings;
  const set = (patch: Partial<LabSettings>) => setEdited({ ...draft, ...patch });
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(settings);
  const models = PARSER_MODELS.map((m) => ({ value: m as string, label: PARSER_MODEL_LABEL[m] ?? m }));
  return (
    <SettingsGroup
      id="lab-models"
      title="Модели компании"
      about="Действуют со следующего распознавания — те же настройки, что во вкладке «ИИ-модель»."
      action={
        dirty ? (
          <span className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEdited(null)}>
              Отменить
            </Button>
            <Button size="sm" loading={apply.isPending} onClick={() => apply.mutate({ stt: draft.stt, parser: draft.parser }, { onSuccess: () => setEdited(null) })}>
              Применить
            </Button>
          </span>
        ) : null
      }
    >
      <SettingRow id="lab-stt" label="Распознавание речи" htmlFor="lab-stt-select" changed={draft.stt.provider !== settings.stt.provider}>
        <SelectInput
          id="lab-stt-select"
          label="Распознавание речи"
          value={draft.stt.provider}
          width={420}
          onChange={(provider) => set({ stt: { ...draft.stt, provider } })}
          items={STT_PROVIDERS.map((p) => ({ value: p, label: STT_PROVIDER_LABEL[p] }))}
        />
      </SettingRow>
      <SettingRow id="lab-parser" label="Разбор поручений" htmlFor="lab-parser-select" changed={draft.parser.model !== settings.parser.model}>
        <SelectInput id="lab-parser-select" label="Разбор поручений" value={draft.parser.model} width={420} onChange={(model) => set({ parser: { ...draft.parser, model } })} items={models} />
      </SettingRow>
      <SettingRow
        id="lab-escalate"
        label="Перепроверять сильной моделью"
        hint="Выключите для чистого сравнения: иначе длинные фразы платят и второй модели"
        htmlFor="lab-escalate-switch"
        changed={draft.parser.escalate !== settings.parser.escalate}
      >
        {draft.parser.escalate ? (
          <SelectInput label="Модель для перепроверки" value={draft.parser.escalation_model} width={260} onChange={(escalation_model) => set({ parser: { ...draft.parser, escalation_model } })} items={models.map((m) => ({ ...m, label: short(m.value) }))} />
        ) : null}
        <Switch id="lab-escalate-switch" label="Перепроверять сильной моделью" checked={draft.parser.escalate} onChange={(escalate) => set({ parser: { ...draft.parser, escalate } })} />
      </SettingRow>
    </SettingsGroup>
  );
}

/** One model call in a line: tokens in / from cache / out, the cache write and the thinking apart, time, price. */
function CallLine({ call }: { call: LabCall }) {
  if (!call.ok) return <p className="text-danger">{short(call.model)} · ошибка · {seconds(call.latency_ms)}</p>;
  return (
    <p className="nums">
      <span className="font-medium">{short(call.model)}</span> · {tokens(call.input_tokens)} / {tokens(call.cache_read_tokens)} / {tokens(call.output_tokens)}
      {call.cache_write_tokens > 0 ? ` (+${tokens(call.cache_write_tokens)} в кэш)` : ""}
      {call.reasoning_tokens > 0 ? ` (мысли ${tokens(call.reasoning_tokens)})` : ""} · {seconds(call.latency_ms)} · {usd(call.cost)}
    </p>
  );
}

/** A recognition whole, in the right-hand panel: the phrase, the STT, every model call, the recording «в корпус». */
function RowPanel({ row, crids, recordings }: { row: LabRow; crids: string[]; recordings: ReturnType<typeof useRecordings>["data"] }) {
  const recording = row.client_request_id ? recordings?.get(row.client_request_id) : undefined;
  return (
    <div className="flex flex-col gap-4 pr-8" data-testid="lab-row-panel">
      <div>
        <p className="desk-label uppercase">
          {whenAqtobe(row.created_at)} · {row.source ?? "?"}
        </p>
        <p className="mt-1.5 text-[15px] leading-[22px]">{row.transcript ?? "—"}</p>
      </div>
      <dl className="desk-list text-[13px] leading-[18px]">
        <div className="py-2">
          <dt className="text-[12px] font-semibold text-muted">Распознавание</dt>
          <dd className="nums mt-0.5">
            {row.stt ? (
              <>
                {row.stt.model} · {row.stt.duration_ms ? `${(row.stt.duration_ms / 1000).toFixed(0)} с аудио · ` : ""}
                {seconds(row.stt.stt_ms)} · {usd(row.stt.cost)}
              </>
            ) : (
              "текст, без STT"
            )}
          </dd>
        </div>
        <div className="py-2">
          <dt className="text-[12px] font-semibold text-muted">
            Разбор{row.parse.escalated ? " · с перепроверкой" : ""}
            {row.parse.rules_version ? ` · правила v${row.parse.rules_version}` : ""}
          </dt>
          <dd className="mt-0.5 flex flex-col gap-0.5">{row.parse.calls.length ? row.parse.calls.map((call, i) => <CallLine key={i} call={call} />) : <p>{short(row.parse.model)} · без ответа</p>}</dd>
        </div>
        <div className="flex items-center justify-between py-2">
          <dt className="text-[12px] font-semibold text-muted">Итого</dt>
          <dd className="nums text-[14px] font-semibold">{usd(row.total_cost)}</dd>
        </div>
      </dl>
      {row.status !== "ok" ? <p className="text-[13px] text-danger">Статус: {row.status}</p> : null}
      {row.client_request_id && recording ? <KeepChip crids={crids} crid={row.client_request_id} recording={recording} /> : null}
    </div>
  );
}

/** «Модели» on the desk: the company's models, the comparison by model, every recognition with its bill. */
function ModelsBench() {
  const bench = useLabBench();
  const me = useMe();
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => bench.data?.rows ?? [], [bench.data]);
  const stats = useMemo(() => statsByModel(rows), [rows]);
  // «В корпус» is the director's (D-155 §3): the rows heard by STT, linked to their recording
  const crids = useMemo(() => rows.flatMap((row) => (row.stt && row.client_request_id ? [row.client_request_id] : [])), [rows]);
  const recordings = useRecordings(crids, me.data?.role === "director").data;

  if (!bench.data) {
    return bench.isError ? (
      <EmptyState title="Лаборатория не загрузилась" hint="Проверьте связь и откройте вкладку ещё раз" />
    ) : (
      <div className="flex flex-col gap-3" aria-hidden>
        <Bone h={180} />
        <Bone h={120} />
      </div>
    );
  }
  const { settings, prices } = bench.data;

  const statColumns: Column<ModelStat>[] = [
    { key: "model", title: "Модель", render: (s) => <span className="font-medium">{short(s.model)}</span> },
    { key: "calls", title: "Вызовов", width: "96px", align: "right", sort: (a, b) => a.calls - b.calls, render: (s) => <span className="nums">{s.calls}{s.failed ? <span className="text-danger"> · {s.failed} ош.</span> : null}</span> },
    {
      key: "tokens",
      title: "Вход / кэш / выход",
      width: "176px",
      align: "right",
      render: (s) => <span className="nums text-muted">{s.calls ? `${tokens(s.input / s.calls)} / ${tokens(s.cache / s.calls)} / ${tokens(s.output / s.calls)}` : "—"}</span>,
    },
    { key: "extra", title: "В кэш · мысли", width: "116px", align: "right", render: (s) => <span className="nums text-muted">{s.calls ? `${s.cacheWrite ? tokens(s.cacheWrite / s.calls) : "—"} · ${s.reasoning ? tokens(s.reasoning / s.calls) : "—"}` : "—"}</span> },
    { key: "time", title: "Время", width: "88px", align: "right", sort: (a, b) => a.ms / Math.max(1, a.calls) - b.ms / Math.max(1, b.calls), render: (s) => <span className="nums">{s.calls ? seconds(s.ms / s.calls) : "—"}</span> },
    { key: "per", title: "За вызов", width: "96px", align: "right", sort: (a, b) => a.cost / Math.max(1, a.calls) - b.cost / Math.max(1, b.calls), render: (s) => <span className="nums font-semibold">{s.calls ? usd(s.cost / s.calls) : "—"}</span> },
    { key: "total", title: "Всего", width: "88px", align: "right", sort: (a, b) => a.cost - b.cost, render: (s) => <span className="nums text-muted">{usd(s.cost)}</span> },
  ];

  const rowColumns: Column<LabRow>[] = [
    { key: "when", title: "Когда", width: "120px", sort: (a, b) => a.created_at.localeCompare(b.created_at), render: (row) => <span className="nums whitespace-nowrap text-muted">{whenAqtobe(row.created_at)}</span> },
    {
      key: "text",
      title: "Фраза",
      render: (row) => (
        <span className="block truncate" title={row.transcript ?? ""}>
          {row.status !== "ok" ? <span className="text-danger">{row.status} · </span> : null}
          {row.transcript ?? "—"}
        </span>
      ),
    },
    {
      key: "path",
      title: "Путь",
      width: "200px",
      render: (row) => (
        <span className="block truncate text-[13px] text-muted">
          {row.stt ? row.stt.model : "текст"} → {row.parse.calls.length ? row.parse.calls.map((c) => short(c.model)).join(" → ") : short(row.parse.model)}
          {row.parse.rules_version ? ` · v${row.parse.rules_version}` : ""}
        </span>
      ),
    },
    { key: "time", title: "Время", width: "84px", align: "right", sort: (a, b) => (a.parse.parse_ms ?? 0) - (b.parse.parse_ms ?? 0), render: (row) => <span className="nums text-muted">{seconds((row.stt?.stt_ms ?? 0) + (row.parse.parse_ms ?? 0) || null)}</span> },
    { key: "cost", title: "Цена", width: "100px", align: "right", sort: (a, b) => (a.total_cost ?? 0) - (b.total_cost ?? 0), render: (row) => <span className="nums font-semibold">{usd(row.total_cost)}</span> },
  ];
  const opened = rows.find((row) => row.id === open) ?? null;

  return (
    <div className="flex flex-col gap-8">
      <ModelsForm settings={settings} />
      <section className="flex flex-col gap-2" aria-label="По моделям">
        <h2 className="lab-head desk-label uppercase">По моделям · среднее на вызов</h2>
        <DataGrid aria-label="Сравнение моделей" columns={statColumns} rows={stats} rowKey={(s) => s.model} empty={<EmptyState title="Вызовов ещё не было" hint="Надиктуйте или напишите поручение — здесь появится цена каждой модели" />} />
      </section>
      <section className="flex flex-col gap-2" aria-label="Расходы по распознаваниям">
        <div className="flex items-baseline gap-2">
          <h2 className="lab-head desk-label uppercase">Распознавания · последние {rows.length}, новые сверху</h2>
          <span className="text-[12px] leading-4 text-muted">Enter или двойной клик: счёт целиком</span>
        </div>
        <DataGrid
          aria-label="Расходы по распознаваниям"
          columns={rowColumns}
          rows={rows}
          rowKey={(row) => row.id}
          selectedKey={open ?? selected}
          onSelect={(row) => setSelected(row.id)}
          onActivate={(row) => setOpen(row.id)}
          rowTone={(row) => (row.status !== "ok" ? "danger" : null)}
          empty={<EmptyState title="Пока ни одного распознавания" hint="Надиктуйте или напишите поручение" />}
        />
      </section>
      <p className="lab-prices text-[12px] leading-4 text-muted">
        Цены за 1M токенов (вход / кэш / выход):{" "}
        {Object.entries(prices.models)
          .map(([m, p]) => `${short(m)} $${p.input} / $${p.cacheRead} / $${p.output}`)
          .join("; ")}
        . STT — за минуту аудио: {Object.entries(prices.stt_per_minute).map(([p, v]) => `${p} $${v}`).join(", ")}. Без длительности записи цена STT не считается.
      </p>
      {opened ? (
        <InPanel panelKey={`lab:${opened.id}`} onClose={() => setOpen(null)}>
          <RowPanel row={opened} crids={crids} recordings={recordings} />
        </InPanel>
      ) : null}
    </div>
  );
}

/** «Лаборатория для всех» and the shelf of pages, as one strip on top of the models. */
function LabTopStrip() {
  const forAll = useLabForAll();
  return (
    <div className="lab-strip flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/60 pb-2">
      <label htmlFor="lab-for-all" className="flex cursor-pointer items-center gap-3">
        <Switch id="lab-for-all" label="Лаборатория для всех" checked={forAll.on ?? false} disabled={forAll.on === null} onChange={forAll.set} />
        <span className="text-[14px] font-medium leading-5">Лаборатория для всех</span>
      </label>
      <span className="text-[13px] leading-[18px] text-muted">вкладка «Лаб» у сотрудников на время тестов — перед релизом выключить</span>
      <span className="ml-auto flex items-center gap-1">
        {SHELF.map((page) => (
          <a
            key={page.href}
            href={page.href}
            target="_blank"
            rel="noreferrer"
            title="Откроется в новой вкладке"
            className="lab-shelf-link inline-flex items-center gap-1 px-2 py-1 text-[13px] text-muted transition-colors duration-[120ms] hover:text-text"
          >
            {page.title}
            <ArrowUpRight size={13} strokeWidth={2.25} aria-hidden />
          </a>
        ))}
      </span>
    </div>
  );
}

/**
 * «Лаборатория» on the desk (D-63, D-154 wave 3): the director's and the secretary's bench. «Модели»
 * is the desk's own — the company's models as a form, the comparison and the recognitions as tables,
 * a recognition's bill in the right-hand panel; «Парсер» (the rules with their corpus run, D-138) and
 * «Себестоимость» (the calculator) are the phone's panels in a desk column. 1–3 switch the tab.
 */
export function LabDesk({ initialTab }: { initialTab: LabTab }) {
  const [tab, setTab] = useState(initialTab);
  const [visited, setVisited] = useState<ReadonlySet<LabTab>>(() => new Set([initialTab]));
  const select = (next: LabTab) => {
    setTab(next);
    setVisited((seen) => (seen.has(next) ? seen : new Set(seen).add(next)));
    window.history.replaceState(null, "", `?tab=${next}`);
  };
  const latest = useRef(select);
  useEffect(() => {
    latest.current = select;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || event.shiftKey || isTypingTarget(event.target)) return;
      if (document.body.hasAttribute("data-dialog-open") || document.body.hasAttribute("data-sheet-open")) return;
      const index = ["Digit1", "Digit2", "Digit3"].indexOf(event.code);
      if (index < 0) return;
      event.preventDefault();
      latest.current(LAB_TABS[index]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useShortcuts("Лаборатория", [
    { keys: ["1", "2", "3"], label: "Модели, Парсер, Себестоимость" },
    { keys: ["↑ ↓", "Enter"], label: "Распознавание — счёт целиком справа" },
  ]);

  return (
    <div className="lab-screen flex w-full min-w-0 flex-col gap-4">
      <PageTitle
        title="Лаборатория"
        state={{ text: "модели, разбор и себестоимость" }}
        actions={
          <SegmentTabs
            aria-label="Разделы лаборатории"
            value={tab}
            onChange={select}
            items={LAB_TABS.map((key) => ({ value: key, label: TITLES[key] }))}
          />
        }
      />
      {visited.has("models") ? (
        <section hidden={tab !== "models"} aria-label="Модели" className="lab-tab flex flex-col gap-6">
          <LabTopStrip />
          <ModelsBench />
        </section>
      ) : null}
      {visited.has("parser") ? (
        // the phone's bench in a reading column; its fields at the desk's size
        <section hidden={tab !== "parser"} aria-label="Парсер" className="lab-tab desk-bench max-w-[880px] [&_input.field]:min-h-9 [&_input.field]:text-[14px] [&_select.field]:min-h-9 [&_select.field]:text-[14px]">
          <ParserPanel />
        </section>
      ) : null}
      {visited.has("costs") ? (
        <section hidden={tab !== "costs"} aria-label="Себестоимость" className="lab-tab desk-bench max-w-[880px]">
          <CostReport />
        </section>
      ) : null}
    </div>
  );
}
