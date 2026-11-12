"use client";

import { BookText, FlaskConical } from "lucide-react";
import Link from "next/link";

import { CheckLine, Segmented, SelectInput, SettingRow, SettingsGroup, Switch, TextInput, TimeInput } from "@/components/desk/settings/form";
import { useDevTools } from "@/components/desk/settings/SettingsFrame";
import { Select } from "@/components/desk/ui/Toolbar";
import { useDraft } from "@/components/settings/draft";
import { PARSER_KIND_LABEL, PARSER_KINDS, REQUIRED_KIND, type ParserKind } from "@/lib/ai/kinds/names";
import { usePeople } from "@/lib/people/queries";
import type { CompanySettings } from "@/lib/settings";
// labels and helpers only — lib/settings.ts itself would bring zod into this page (D-126)
import { PARSER_MODEL_LABEL, PARSER_MODELS, STT_PROVIDER_LABEL, STT_PROVIDERS, type SttProviderKey } from "@/lib/settings-plain";
import { pluralRu } from "@/lib/tasks/status-text";

type Convention = CompanySettings["conventions"][number];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The fixed keys of «Слова о сроках» (task 026), in the order the server keeps them. */
const CONVENTION_LABEL: Record<string, string> = {
  morning: "Утро",
  before_lunch: "До обеда",
  lunch: "Обед",
  after_lunch: "После обеда",
  evening: "Вечер",
  end_of_day: "Конец дня",
  end_of_week: "Конец недели",
  this_week: "На неделе",
  day_default: "День без времени",
  weekday_default: "День недели без времени",
};

/** Below 0.8 the deadline is a yellow chip on the confirmation. */
const CONFIDENCE_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];

const CLOSED_STEPS = [30, 90, 180, 365];
const ORPHAN_STEPS = [7, 30, 90];
const RETENTION_DEFAULTS = { closed_days: 90, orphan_days: 30 };

const days = (n: number) => `${n} ${pluralRu(n, ["день", "дня", "дней"])}`;

/** Steps as a choice; a term set some other way (SQL, an older screen) is its own choice, never «none chosen». */
const stepsOf = (steps: number[], value: number) => [...new Set([...steps, value])].sort((a, b) => a - b).map((n) => ({ value: n, label: days(n) }));

/**
 * «Слова о сроках» as a table (D-15, task 026): when — how it is said (the model reads it) — the
 * time it resolves to (the system sets it) — how sure the deadline is. One row per fixed key.
 */
function ConventionsTable({ rows, saved, onChange }: { rows: Convention[]; saved: Convention[]; onChange: (index: number, patch: Partial<Convention>) => void }) {
  return (
    <div className="set-conventions desk-cells" data-testid="settings-conventions">
      <div className="set-conventions-head desk-label grid grid-cols-[180px_minmax(0,1fr)_76px_150px] items-center gap-4 border-b border-text pb-1 uppercase">
        <span>Когда</span>
        <span>Как говорите · через «/»</span>
        <span>Время</span>
        <span>Уверенность</span>
      </div>
      {rows.map((row, index) => {
        // an offline copy may hold rows from before the keys
        const label = CONVENTION_LABEL[row.key] ?? row.phrase;
        const before = saved.find((s) => s.key === row.key);
        const changed = !before || !same(before, row);
        const steps = [...new Set([...CONFIDENCE_STEPS, row.confidence])].sort((a, b) => a - b);
        return (
          <div key={row.key ?? index} className="set-conventions-row relative grid grid-cols-[180px_minmax(0,1fr)_76px_150px] items-center gap-4 border-b border-border/60 py-0.5 last:border-b-0">
            {changed ? <span aria-hidden className="set-row-mark" /> : null}
            <span className="min-w-0 text-[14px] leading-5">
              {label}
              {row.day === "friday" ? <span className="block text-[12px] leading-4 text-muted">пятница этой недели</span> : null}
            </span>
            <TextInput label={`${label}: как говорите`} value={row.phrase} width="100%" placeholder="как говорите, через «/»" onChange={(phrase) => onChange(index, { phrase })} />
            <TimeInput label={`${label}: время`} value={row.time} onChange={(time) => onChange(index, { time })} />
            <Select aria-label={`${label}: уверенность`} value={String(row.confidence)} onChange={(event) => onChange(index, { confidence: Number(event.target.value) })} className="w-full text-[13px]">
              {steps.map((step) => (
                <option key={step} value={String(step)}>
                  {step.toFixed(1)} · {step < 0.8 ? "проверить" : "уверенно"}
                </option>
              ))}
            </Select>
          </div>
        );
      })}
    </div>
  );
}

/**
 * «ИИ-модель» on the desk: how a voice becomes work — hearing it (STT), reading it (the parser and
 * its kinds), the company's words, what «до обеда» means here, how long the recordings are kept.
 * The company's own parser rules are saved only after a corpus run: they live in the lab (D-138).
 */
export function AiPanel() {
  const { draft, server, update } = useDraft();
  const people = usePeople();
  const stt = draft.stt;
  const parser = draft.parser;
  // `??`: an offline copy (D-127) may hold settings from before the kinds and the retention
  const kinds: readonly ParserKind[] = parser.kinds ?? PARSER_KINDS;
  const retention = draft.voice_retention ?? RETENTION_DEFAULTS;
  const savedRetention = server.voice_retention ?? RETENTION_DEFAULTS;
  const setStt = (patch: Partial<CompanySettings["stt"]>) => update({ stt: { ...stt, ...patch } });
  const setParser = (patch: Partial<CompanySettings["parser"]>) => update({ parser: { ...parser, ...patch } });
  const toggleKind = (kind: ParserKind, on: boolean) => {
    const next = new Set(kinds);
    if (on) next.add(kind);
    else next.delete(kind);
    // the fixed order, so switching a kind off and on again is no change
    setParser({ kinds: PARSER_KINDS.filter((k) => k === REQUIRED_KIND || next.has(k)) });
  };
  const names = (people.data ?? []).filter((p) => p.is_active && p.role !== "tv").reduce((sum, p) => sum + p.aliases.length, 0);
  const words = server.vocabulary.length;
  const rules = server.parser_rules?.versions[0];
  // the rules live in the lab (D-138): without the developers' tools the row would lead nowhere
  const devTools = useDevTools();
  const models = PARSER_MODELS.map((m) => ({ value: m as string, label: PARSER_MODEL_LABEL[m] ?? m }));

  return (
    <div className="flex flex-col gap-6">
      <SettingsGroup id="stt" title="Распознавание речи" about="Как Pulse переводит голос в текст. Выбрано по проверке на живых записях: без нужды не меняйте.">
        <SettingRow id="stt-provider" label="Основной провайдер" htmlFor="ctl-stt-provider" changed={stt.provider !== server.stt.provider}>
          <SelectInput
            id="ctl-stt-provider"
            label="Основной провайдер"
            value={stt.provider}
            width={420}
            onChange={(provider) => setStt({ provider, fallback: stt.fallback === provider ? null : stt.fallback })}
            items={STT_PROVIDERS.map((p) => ({ value: p, label: STT_PROVIDER_LABEL[p] }))}
          />
        </SettingRow>
        <SettingRow id="stt-fallback" label="Запасной провайдер" hint="Если основной не ответил" htmlFor="ctl-stt-fallback" changed={stt.fallback !== server.stt.fallback}>
          <SelectInput
            id="ctl-stt-fallback"
            label="Запасной провайдер"
            value={(stt.fallback ?? "") as SttProviderKey | ""}
            width={420}
            onChange={(value) => setStt({ fallback: (value || null) as CompanySettings["stt"]["fallback"] })}
            items={[{ value: "" as const, label: "Нет" }, ...STT_PROVIDERS.filter((p) => p !== stt.provider).map((p) => ({ value: p, label: STT_PROVIDER_LABEL[p] }))]}
          />
        </SettingRow>
        <SettingRow id="stt-language" label="Язык" hint="«Авто» лучше слышит смешанную русско-казахскую речь" changed={stt.language !== server.stt.language}>
          <Segmented
            label="Язык речи"
            value={stt.language}
            onChange={(language) => setStt({ language })}
            items={[
              { value: "auto", label: "Авто — смешанная" },
              { value: "ru", label: "Только русский" },
            ]}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="parser" title="Разбор поручений" about="Модель читает транскрипт и раскладывает его на задачи, объявления и очки.">
        <SettingRow id="parser-model" label="Основная модель" htmlFor="ctl-parser-model" changed={parser.model !== server.parser.model}>
          <SelectInput id="ctl-parser-model" label="Основная модель" value={parser.model} width={420} onChange={(model) => setParser({ model })} items={models} />
        </SettingRow>
        <SettingRow
          id="parser-escalate"
          label="Перепроверять сильной моделью"
          hint="Длинные монологи и сомнительные исполнители уходят на вторую модель"
          htmlFor="ctl-parser-escalate"
          changed={parser.escalate !== server.parser.escalate}
        >
          <Switch id="ctl-parser-escalate" label="Перепроверять сильной моделью" checked={parser.escalate} onChange={(escalate) => setParser({ escalate })} />
        </SettingRow>
        <SettingRow id="parser-escalation-model" label="Модель для перепроверки" htmlFor="ctl-parser-escalation" muted={!parser.escalate} changed={parser.escalation_model !== server.parser.escalation_model}>
          <SelectInput id="ctl-parser-escalation" label="Модель для перепроверки" value={parser.escalation_model} width={420} onChange={(escalation_model) => setParser({ escalation_model })} items={models} />
        </SettingRow>
        <SettingRow id="parser-kinds" label="Что модель различает" hint="Выключенного вида модель не знает: ни правил, ни примеров. Поручения — всегда" stack changed={!same(kinds, server.parser.kinds ?? PARSER_KINDS)}>
          <div className="grid grid-cols-2 gap-x-8" data-testid="settings-parser-kinds">
            {PARSER_KINDS.map((kind) => (
              <CheckLine
                key={kind}
                label={PARSER_KIND_LABEL[kind]}
                hint={kind === REQUIRED_KIND ? "всегда" : undefined}
                checked={kind === REQUIRED_KIND || kinds.includes(kind)}
                disabled={kind === REQUIRED_KIND}
                onChange={(on) => toggleKind(kind, on)}
              />
            ))}
          </div>
        </SettingRow>
        {devTools ? (
          <SettingRow id="parser-rules" label="Правила компании" hint={rules?.text ? `Действует версия ${rules.version}. Меняются только после проверки на корпусе` : "Своих нет — разбор идёт по ядру промпта"}>
            <Link href="/desk/settings/lab?tab=parser" data-testid="settings-parser-rules" className="set-open btn-secondary inline-flex h-9 items-center gap-2 px-3 text-[13px] font-semibold">
              <FlaskConical size={15} strokeWidth={2} aria-hidden />
              Открыть в Лаборатории
            </Link>
          </SettingRow>
        ) : null}
      </SettingsGroup>

      <SettingsGroup id="dictionary" title="Словарь" about="Как ИИ слышит имена людей и слова компании — контрагентов, объекты, термины.">
        <SettingRow
          id="dictionary-open"
          label="Имена и слова"
          hint={`${people.data ? `${names} ${pluralRu(names, ["имя", "имени", "имён"])}` : "имена"} · ${words ? `${words} ${pluralRu(words, ["слово", "слова", "слов"])}` : "слов нет"}`}
        >
          <Link href="/desk/settings/dictionary" data-testid="settings-dictionary" className="set-open btn-secondary inline-flex h-9 items-center gap-2 px-3 text-[13px] font-semibold">
            <BookText size={15} strokeWidth={2} aria-hidden />
            Открыть словарь
          </Link>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup
        id="conventions"
        title="Слова о сроках"
        about="Что значит «до обеда» или «к вечеру» именно у вас. Слова читает модель, время ставит система. Уверенность ниже 0.8 — срок придёт на проверку жёлтым."
      >
        <SettingRow id="conventions-table" label="Правила" stack changed={!same(draft.conventions, server.conventions)}>
          <ConventionsTable rows={draft.conventions} saved={server.conventions} onChange={(index, patch) => update({ conventions: draft.conventions.map((row, i) => (i === index ? { ...row, ...patch } : row)) })} />
        </SettingRow>
      </SettingsGroup>

      {/* the one place in the settings where a choice deletes: a shorter term takes the sound away for good */}
      <SettingsGroup
        id="retention"
        title="Хранение записей"
        tone="danger"
        about="Тексты и расшифровки остаются навсегда; удаляется только звук. Срок короче — записи старше него удалятся при ближайшей уборке, вернуть их нельзя. Запись «в корпус» из Лаборатории не удаляется."
      >
        <SettingRow id="retention-closed" label="После закрытия дела" hint="Сколько хранить голосовое, когда задача закрыта" changed={retention.closed_days !== savedRetention.closed_days}>
          <Segmented label="Хранить после закрытия дела" value={retention.closed_days} onChange={(closed_days) => update({ voice_retention: { ...retention, closed_days } })} items={stepsOf(CLOSED_STEPS, retention.closed_days)} />
        </SettingRow>
        <SettingRow id="retention-orphan" label="Запись без дела" hint="Голосовое, из которого ничего не вышло" changed={retention.orphan_days !== savedRetention.orphan_days}>
          <Segmented label="Хранить запись без дела" value={retention.orphan_days} onChange={(orphan_days) => update({ voice_retention: { ...retention, orphan_days } })} items={stepsOf(ORPHAN_STEPS, retention.orphan_days)} />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
