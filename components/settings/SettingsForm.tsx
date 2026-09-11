"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { SectionBone, SkeletonGroup } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import {
  PARSER_MODEL_LABEL,
  PARSER_MODELS,
  STT_PROVIDER_LABEL,
  STT_PROVIDERS,
  type CompanySettings,
  type SettingsPatch,
} from "@/lib/settings";

const FIELD =
  "min-h-[44px] w-full field px-3 text-[16px] leading-[22px] text-text outline-none focus:border-accent";

async function fetchSettings(): Promise<CompanySettings> {
  const res = await fetch("/api/settings", { credentials: "include" });
  if (!res.ok) throw new Error("settings failed");
  return ((await res.json()) as { settings: CompanySettings }).settings;
}

async function patchSettings(patch: SettingsPatch): Promise<CompanySettings> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("save failed");
  return ((await res.json()) as { settings: CompanySettings }).settings;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="text-[19px] font-semibold leading-6">{title}</h2>
      {hint ? <p className="mt-1 text-[13px] leading-4 text-muted">{hint}</p> : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[14px] font-medium leading-[18px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
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

export function SettingsForm() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  // Edits live in `edited`; until the first edit the form mirrors the server value.
  const [edited, setEdited] = useState<CompanySettings | null>(null);
  const [vocabularyEdited, setVocabularyEdited] = useState<string | null>(null);
  const draft = edited ?? query.data ?? null;
  const vocabularyText = vocabularyEdited ?? draft?.vocabulary.join(", ") ?? "";
  const setDraft = (next: CompanySettings) => setEdited(next);
  const setVocabularyText = (next: string) => setVocabularyEdited(next);

  const save = useMutation({
    mutationFn: patchSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(["settings"], settings);
      setEdited(null);
      setVocabularyEdited(null);
      toast("Сохранил настройки");
    },
    onError: () => toast("Не получилось сохранить. Попробуй ещё раз"),
  });

  if (!draft) {
    return (
      <SkeletonGroup className="flex flex-col gap-4">
        <SectionBone fields={3} />
        <SectionBone fields={2} />
      </SkeletonGroup>
    );
  }

  const update = (patch: Partial<CompanySettings>) => setDraft({ ...draft, ...patch });

  const submit = () => {
    const vocabulary = vocabularyText
      .split(/[,\n;]/)
      .map((v) => v.trim())
      .filter(Boolean);
    save.mutate({
      stt: draft.stt,
      parser: draft.parser,
      vocabulary,
      points_enabled: draft.points_enabled,
      rating_mode: draft.rating_mode,
      delivery_window: draft.delivery_window,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Section title="Распознавание речи" hint="Итог СТТ-гейта: gpt-4o-transcribe без языковой подсказки. Менять — только по данным гейта.">
        <Field label="Основной провайдер">
          <select className={FIELD} value={draft.stt.provider} onChange={(e) => update({ stt: { ...draft.stt, provider: e.target.value as CompanySettings["stt"]["provider"] } })}>
            {STT_PROVIDERS.map((p) => (
              <option key={p} value={p}>{STT_PROVIDER_LABEL[p]}</option>
            ))}
          </select>
        </Field>
        <Field label="Запасной провайдер (если основной упал)">
          <select className={FIELD} value={draft.stt.fallback ?? ""} onChange={(e) => update({ stt: { ...draft.stt, fallback: (e.target.value || null) as CompanySettings["stt"]["fallback"] } })}>
            <option value="">Нет</option>
            {STT_PROVIDERS.filter((p) => p !== draft.stt.provider).map((p) => (
              <option key={p} value={p}>{STT_PROVIDER_LABEL[p]}</option>
            ))}
          </select>
        </Field>
        <Field label="Язык">
          <select className={FIELD} value={draft.stt.language} onChange={(e) => update({ stt: { ...draft.stt, language: e.target.value as "auto" | "ru" } })}>
            <option value="auto">Авто — смешанная русско-казахская речь</option>
            <option value="ru">Только русский</option>
          </select>
        </Field>
      </Section>

      <Section title="Разбор поручений" hint="Модель читает транскрипт и раскладывает его на задачи, объявления и очки.">
        <Field label="Основная модель">
          <select className={FIELD} value={draft.parser.model} onChange={(e) => update({ parser: { ...draft.parser, model: e.target.value } })}>
            {PARSER_MODELS.map((m) => (
              <option key={m} value={m}>{PARSER_MODEL_LABEL[m] ?? m}</option>
            ))}
          </select>
        </Field>
        <Toggle
          label="Перепроверять сильной моделью"
          hint="Длинные монологи и сомнительные исполнители уходят на вторую модель"
          checked={draft.parser.escalate}
          onChange={(v) => update({ parser: { ...draft.parser, escalate: v } })}
        />
        <Field label="Модель для перепроверки">
          <select className={FIELD} value={draft.parser.escalation_model} onChange={(e) => update({ parser: { ...draft.parser, escalation_model: e.target.value } })}>
            {PARSER_MODELS.map((m) => (
              <option key={m} value={m}>{PARSER_MODEL_LABEL[m] ?? m}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Словарь" hint="Контрагенты и объекты, которые распознавание должно знать по имени. Через запятую.">
        <textarea
          className={`${FIELD} py-3`}
          rows={3}
          value={vocabularyText}
          onChange={(e) => setVocabularyText(e.target.value)}
          placeholder="Казхром, КазАзот, ERG, Актобе-склад"
        />
      </Section>

      <Section title="Очки и рейтинг" hint="Во время пилота очки выключены (D-40). Включи, когда команда привыкнет к задачам.">
        <Toggle
          label="Очки включены"
          hint="Директор начисляет очки голосом и с экрана рейтинга"
          checked={draft.points_enabled}
          onChange={(v) => update({ points_enabled: v })}
        />
        <Field label="Кто видит рейтинг целиком">
          <select className={FIELD} value={draft.rating_mode} onChange={(e) => update({ rating_mode: e.target.value as "top5" | "full" })}>
            <option value="top5">Топ-5 всем, полный список — директору</option>
            <option value="full">Полный список всем</option>
          </select>
        </Field>
      </Section>

      <Section title="Тихие часы" hint="Вне окна задачи ждут утра, если не нажать «отправить сейчас».">
        <div className="grid grid-cols-2 gap-3">
          <Field label="С">
            <input type="time" className={FIELD} value={draft.delivery_window.from} onChange={(e) => update({ delivery_window: { ...draft.delivery_window, from: e.target.value } })} />
          </Field>
          <Field label="До">
            <input type="time" className={FIELD} value={draft.delivery_window.to} onChange={(e) => update({ delivery_window: { ...draft.delivery_window, to: e.target.value } })} />
          </Field>
        </div>
      </Section>

      <Button block onClick={submit} disabled={save.isPending}>
        {save.isPending ? "Сохраняю…" : "Сохранить"}
      </Button>
    </div>
  );
}
