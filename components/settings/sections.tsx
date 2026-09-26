"use client";

import Link from "next/link";

import { ScenePicker } from "@/components/secretary/ScenePicker";
import { useDraft } from "@/components/settings/draft";
import { BookIcon, ClockIcon, CupIcon, MicIcon, MoonIcon, ParseIcon, StarIcon } from "@/components/settings/icons";
import { Button } from "@/components/ui/Button";
import { TimeField } from "@/components/ui/datetime/TimeField";
import { Disclosure } from "@/components/ui/Disclosure";
import { usePeople } from "@/lib/people/queries";
import type { CompanySettings } from "@/lib/settings";
// labels and helpers only — lib/settings.ts itself would bring zod into this page (D-126)
import {
  PARSER_MODEL_LABEL,
  PARSER_MODEL_SHORT,
  PARSER_MODELS,
  STT_PROVIDER_LABEL,
  STT_PROVIDER_SHORT,
  STT_PROVIDERS,
  withSecretaryCodes,
} from "@/lib/settings-plain";

const FIELD =
  "min-h-[44px] w-full field px-3 text-[16px] leading-[22px] text-text outline-none focus:border-accent";

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

/**
 * The actions of one section: they appear only where something was actually changed, so
 * the director saves next to the field instead of hunting for one button under six
 * sections — and a half-edited section never rides along with another one's save.
 */
function SectionActions({ pending, onSave, onReset }: { pending: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <div className="card-in mt-4 flex gap-2">
      <Button block loading={pending} onClick={onSave}>
        Сохранить
      </Button>
      <Button variant="ghost" disabled={pending} onClick={onReset}>
        Отменить
      </Button>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function SttSection() {
  const { draft, server, update, dirty, save, saving } = useDraft();
  return (
    <Disclosure
      icon={<MicIcon />}
      title="Распознавание речи"
      dirty={dirty.stt}
      summary={`${STT_PROVIDER_SHORT[draft.stt.provider]} · ${draft.stt.language === "auto" ? "смешанная речь" : "только русский"}`}
      hint="Итог СТТ-гейта: gpt-4o-transcribe без языковой подсказки. Менять — только по данным гейта."
    >
      <div className="flex flex-col gap-4">
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
      </div>
      {dirty.stt ? (
        <SectionActions pending={saving("stt")} onSave={() => save({ stt: draft.stt })} onReset={() => update({ stt: server.stt })} />
      ) : null}
    </Disclosure>
  );
}

export function ParserSection() {
  const { draft, server, update, dirty, save, saving } = useDraft();
  return (
    <Disclosure
      icon={<ParseIcon />}
      title="Разбор поручений"
      dirty={dirty.parser}
      summary={`${PARSER_MODEL_SHORT[draft.parser.model] ?? draft.parser.model} · ${
        draft.parser.escalate ? "с перепроверкой" : "без перепроверки"
      }`}
      hint="Модель читает транскрипт и раскладывает его на задачи, объявления и очки."
    >
      <div className="flex flex-col gap-4">
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
        {draft.parser.escalate ? (
          <Field label="Модель для перепроверки">
            <select className={FIELD} value={draft.parser.escalation_model} onChange={(e) => update({ parser: { ...draft.parser, escalation_model: e.target.value } })}>
              {PARSER_MODELS.map((m) => (
                <option key={m} value={m}>{PARSER_MODEL_LABEL[m] ?? m}</option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      {dirty.parser ? (
        <SectionActions pending={saving("parser")} onSave={() => save({ parser: draft.parser })} onReset={() => update({ parser: server.parser })} />
      ) : null}
    </Disclosure>
  );
}

/**
 * «Словарь» has a page of its own (D-111): the names people are called by and the words
 * the recogniser has to spell, with instructions. Here — the header of a section that
 * leads there, so the tab keeps one rhythm of cards.
 */
export function DictionarySection() {
  const { server } = useDraft();
  const people = usePeople();
  const names = (people.data ?? [])
    .filter((p) => p.is_active && p.role !== "tv")
    .reduce((sum, p) => sum + p.aliases.length, 0);
  const words = server.vocabulary.length;
  return (
    <Link
      href="/settings/dictionary"
      data-testid="settings-dictionary"
      className="card flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[120ms] active:bg-surface-2"
    >
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}
      >
        <BookIcon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]">Словарь</span>
        <span className="mt-0.5 block truncate text-[13px] leading-4 text-muted">
          {people.data ? `${plural(names, "имя", "имени", "имён")} · ` : "имена · "}
          {words ? plural(words, "слово", "слова", "слов") : "слов нет"}
        </span>
      </span>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0 text-muted">
        <polyline points="6,3.5 10.5,8 6,12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

export function ConventionsSection() {
  const { draft, server, update, conventions, dirty, save, saving } = useDraft();
  const updateConvention = (index: number, patch: Partial<CompanySettings["conventions"][number]>) =>
    update({ conventions: draft.conventions.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  return (
    <Disclosure
      icon={<ClockIcon />}
      title="Слова о сроках"
      dirty={dirty.conventions}
      summary={conventions.length ? plural(conventions.length, "правило", "правила", "правил") : "нет правил"}
      hint="Что значит «до обеда» или «к вечеру» именно у вас. Сверху — как говорите, под ним — во сколько это."
    >
      <div className="flex flex-col gap-3">
        {draft.conventions.map((row, index) => (
          // Two lines per row: a phone-width screen cannot fit both texts side by side.
          <div key={index} className="grid grid-cols-[1fr_44px] gap-x-2 gap-y-1">
            <input
              className={FIELD}
              aria-label="Как говорите"
              placeholder="до обеда"
              value={row.phrase}
              onChange={(e) => updateConvention(index, { phrase: e.target.value })}
            />
            <button
              type="button"
              aria-label="Убрать строку"
              className="min-h-[44px] min-w-[44px] text-[20px] leading-none text-muted"
              onClick={() => update({ conventions: draft.conventions.filter((_, i) => i !== index) })}
            >
              ×
            </button>
            <div className="col-span-2 flex items-center gap-2 pl-3">
              <span aria-hidden className="text-[16px] text-muted">
                =
              </span>
              <input
                className={FIELD}
                aria-label="Означает"
                placeholder="13:00 названного дня"
                value={row.meaning}
                onChange={(e) => updateConvention(index, { meaning: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Button
          variant="secondary"
          block
          onClick={() => update({ conventions: [...draft.conventions, { phrase: "", meaning: "", confidence: 0.7 }] })}
        >
          Добавить слово
        </Button>
      </div>
      {dirty.conventions ? (
        <SectionActions
          pending={saving("conventions")}
          onSave={() => save({ conventions })}
          onReset={() => update({ conventions: server.conventions })}
        />
      ) : null}
    </Disclosure>
  );
}

export function SecretarySection() {
  const { draft, server, update, dirty, save, saving } = useDraft();
  // the catalogue matters only where somebody answers it: no active secretary — no module (D-79 §4)
  const people = usePeople();
  const secretaries = (people.data ?? []).filter((p) => p.role === "secretary" && p.is_active);
  const updateAction = (index: number, patch: Partial<CompanySettings["secretary"]["actions"][number]>) =>
    update({
      secretary: {
        ...draft.secretary,
        actions: draft.secretary.actions.map((row, i) => (i === index ? { ...row, ...patch } : row)),
      },
    });
  return (
    <Disclosure
      icon={<CupIcon />}
      title="Секретарь"
      dirty={dirty.secretary}
      summary={
        secretaries.length
          ? `${secretaries.map((p) => p.full_name.split(" ")[0]).join(", ")} · ${plural(draft.secretary.actions.length, "кнопка", "кнопки", "кнопок")}`
          : "роль никому не назначена"
      }
      hint="Кнопки, которыми ты зовёшь секретаря. Заявка — не задача: без срока, без приёмки, живёт минуты."
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-4 text-muted">
          {secretaries.length ? (
            <>
              Сейчас это {secretaries.map((p) => p.full_name.split(" ")[0]).join(", ")}. Роль меняется в{" "}
              <Link href="/settings?tab=team" className="underline">
                карточке человека
              </Link>
              .
            </>
          ) : (
            <>
              Назначь роль «Секретарь» в{" "}
              <Link href="/settings?tab=team" className="underline">
                карточке человека
              </Link>{" "}
              — тогда на Пульсе появится секретарь за столом.
            </>
          )}
        </p>
        <div className="flex flex-col gap-3">
          {draft.secretary.actions.map((row, index) => (
            // the button, and what the secretary's face plays for it (D-97)
            <div key={index} className="flex flex-col gap-1.5">
              <div className="grid grid-cols-[56px_1fr_44px] gap-2">
                <input
                  className={`${FIELD} px-0 text-center`}
                  aria-label="Значок"
                  maxLength={4}
                  placeholder="☕"
                  value={row.icon}
                  onChange={(e) => updateAction(index, { icon: e.target.value })}
                />
                <input
                  className={FIELD}
                  aria-label="Надпись"
                  placeholder="Кофе"
                  value={row.label}
                  onChange={(e) => updateAction(index, { label: e.target.value })}
                />
                <button
                  type="button"
                  aria-label="Убрать действие"
                  className="min-h-[44px] min-w-[44px] text-[20px] leading-none text-muted"
                  onClick={() =>
                    update({
                      secretary: {
                        ...draft.secretary,
                        actions: draft.secretary.actions.filter((_, i) => i !== index),
                      },
                    })
                  }
                >
                  ×
                </button>
              </div>
              <ScenePicker action={row} className={FIELD} onChange={(scene) => updateAction(index, { scene })} />
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          block
          disabled={draft.secretary.actions.length >= 12}
          onClick={() =>
            update({
              secretary: {
                ...draft.secretary,
                // the code is filled on save: the director names the button, not its id
                actions: [...draft.secretary.actions, { code: "", label: "", icon: "", synonyms: [] }],
              },
            })
          }
        >
          Добавить действие
        </Button>
        <Field label="Телефон охраны — для кнопки «Позвонить охране»">
          <input
            type="tel"
            inputMode="tel"
            className={FIELD}
            placeholder="+7 700 000 00 00"
            value={draft.secretary.security_phone}
            onChange={(e) => update({ secretary: { ...draft.secretary, security_phone: e.target.value } })}
          />
        </Field>
        <Field label="Повторить пуш через, минут">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            className={FIELD}
            value={draft.secretary.escalate_after_min}
            onChange={(e) =>
              update({
                secretary: {
                  ...draft.secretary,
                  escalate_after_min: Math.min(60, Math.max(1, Number(e.target.value) || 1)),
                },
              })
            }
          />
        </Field>
      </div>
      {dirty.secretary ? (
        <SectionActions
          pending={saving("secretary")}
          onSave={() =>
            save({
              secretary: {
                escalate_after_min: draft.secretary.escalate_after_min,
                security_phone: draft.secretary.security_phone.trim(),
                // an empty row is scratch space; a new row gets its code here, once and for good
                actions: withSecretaryCodes(draft.secretary.actions),
              },
            })
          }
          onReset={() => update({ secretary: server.secretary })}
        />
      ) : null}
    </Disclosure>
  );
}

export function PointsSection() {
  const { draft, server, update, dirty, save, saving } = useDraft();
  return (
    <Disclosure
      icon={<StarIcon />}
      title="Очки и рейтинг"
      dirty={dirty.points}
      summary={
        draft.points_enabled
          ? `включены · ${draft.rating_mode === "top5" ? "топ-5 всем" : "полный список всем"}`
          : "выключены"
      }
      hint="Во время пилота очки выключены (D-40). Включи, когда команда привыкнет к задачам."
    >
      <div className="flex flex-col gap-4">
        <Toggle
          label="Очки включены"
          hint="Директор начисляет очки голосом и с экрана рейтинга"
          checked={draft.points_enabled}
          onChange={(v) => update({ points_enabled: v })}
        />
        {draft.points_enabled ? (
          <Field label="Кто видит рейтинг целиком">
            <select className={FIELD} value={draft.rating_mode} onChange={(e) => update({ rating_mode: e.target.value as "top5" | "full" })}>
              <option value="top5">Топ-5 всем, полный список — директору</option>
              <option value="full">Полный список всем</option>
            </select>
          </Field>
        ) : null}
      </div>
      {dirty.points ? (
        <SectionActions
          pending={saving("points_enabled")}
          onSave={() => save({ points_enabled: draft.points_enabled, rating_mode: draft.rating_mode })}
          onReset={() => update({ points_enabled: server.points_enabled, rating_mode: server.rating_mode })}
        />
      ) : null}
    </Disclosure>
  );
}

/** The faces (D-119): whether they dress for the holidays of the company's calendar. */
export function MascotSection() {
  const { draft, server, update, dirty, save, saving } = useDraft();
  return (
    <Disclosure
      icon={<StarIcon />}
      title="Маскот"
      dirty={dirty.mascot}
      summary={draft.mascot_seasons ? "наряжается к праздникам" : "без праздничных нарядов"}
      hint="Новый год — колпак с 20 декабря по 7 января, Наурыз — тюльпан 20–23 марта"
    >
      <Toggle
        label="Праздничные наряды"
        hint="Лица директора, сотрудников, секретаря и экрана в кабинете"
        checked={draft.mascot_seasons}
        onChange={(v) => update({ mascot_seasons: v })}
      />
      {dirty.mascot ? (
        <SectionActions
          pending={saving("mascot_seasons")}
          onSave={() => save({ mascot_seasons: draft.mascot_seasons })}
          onReset={() => update({ mascot_seasons: server.mascot_seasons })}
        />
      ) : null}
    </Disclosure>
  );
}

export function WindowSection() {
  const { draft, server, update, dirty, save, saving } = useDraft();
  return (
    <Disclosure
      icon={<MoonIcon />}
      title="Тихие часы"
      dirty={dirty.window}
      summary={`доставка ${draft.delivery_window.from} — ${draft.delivery_window.to}`}
      hint="Вне окна задачи ждут утра, если не нажать «отправить сейчас»."
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="С">
          <TimeField label="Доставка с" value={draft.delivery_window.from} onChange={(from) => update({ delivery_window: { ...draft.delivery_window, from } })} />
        </Field>
        <Field label="До">
          <TimeField label="Доставка до" value={draft.delivery_window.to} onChange={(to) => update({ delivery_window: { ...draft.delivery_window, to } })} />
        </Field>
      </div>
      {dirty.window ? (
        <SectionActions
          pending={saving("delivery_window")}
          onSave={() => save({ delivery_window: draft.delivery_window })}
          onReset={() => update({ delivery_window: server.delivery_window })}
        />
      ) : null}
    </Disclosure>
  );
}
