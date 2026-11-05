"use client";

import Link from "next/link";
import { useState } from "react";

import { GroupNote, NumberInput, Segmented, SettingRow, SettingsGroup, Switch, TimeInput } from "@/components/desk/settings/form";
import { Popover } from "@/components/desk/ui/Popover";
import { useDraft } from "@/components/settings/draft";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/datetime/Calendar";
import { kzFixedHolidays } from "@/lib/daily-report/holidays";
import { parseYmd, todayYmd, WEEKDAYS_SHORT_RU, type Ymd } from "@/lib/datetime/calendar";
import { REACTION_CODES, REACTION_LABEL } from "@/lib/points/reactions";
import type { CompanySettings } from "@/lib/settings";
import { pluralRu } from "@/lib/tasks/status-text";

type Rules = CompanySettings["points_rules"];
type Report = CompanySettings["daily_report"];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"] as const;

/** «21 мар, сб»; another year than this one is written out. */
function holidayLabel(ymd: Ymd, thisYear: number): string {
  const parts = parseYmd(ymd);
  if (!parts) return ymd;
  const weekday = WEEKDAYS_SHORT_RU[(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7];
  return `${parts.day} ${MONTHS[parts.month - 1]}${parts.year === thisYear ? "" : ` ${parts.year}`}, ${weekday}`;
}

/** The working days as seven toggles — Monday first; the last one on cannot go off (a week without a working day asks nothing). */
function Weekdays({ days, onChange }: { days: readonly number[]; onChange: (days: number[]) => void }) {
  return (
    <div role="group" aria-label="Рабочие дни" className="seg inline-flex h-9 items-center gap-0.5 p-0.5">
      {WEEKDAYS_SHORT_RU.map((label, index) => {
        const day = index + 1;
        const on = days.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (on && days.length === 1) return;
              onChange(on ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b));
            }}
            className={`flex h-8 w-7 items-center justify-center text-[13px] font-semibold leading-4 transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${
              on ? "seg-thumb text-text" : "text-muted/70 hover:text-text"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The company's holidays (D-155 §7): the days from today on as words with ×, the past ones only
 * counted (the director's «Период» still reads them); «+ День…» opens the month beside the
 * button, «+ Праздники Казахстана» adds the fixed-date ones without repeats.
 */
function Holidays({ days, onChange }: { days: readonly Ymd[]; onChange: (days: Ymd[]) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const today = todayYmd();
  const year = Number(today.slice(0, 4));
  const years = today.slice(5) >= "11-01" ? [year, year + 1] : [year];
  const upcoming = days.filter((day) => day >= today);
  const past = days.length - upcoming.length;
  const add = (more: readonly Ymd[]) => onChange([...new Set([...days, ...more])].sort());

  return (
    <div className="flex flex-col gap-2" data-testid="report-holidays">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {upcoming.map((day) => {
          const label = holidayLabel(day, year);
          return (
            <span key={day} className="nums inline-flex h-6 items-center text-[13px] leading-4">
              {label}
              <button
                type="button"
                aria-label={`Убрать праздник ${label}`}
                onClick={() => onChange(days.filter((d) => d !== day))}
                className="flex h-6 w-5 items-center justify-center text-[14px] leading-none text-muted hover:text-danger"
              >
                ×
              </button>
            </span>
          );
        })}
        {upcoming.length === 0 ? <span className="text-[13px] leading-5 text-muted">Впереди праздников нет</span> : null}
        {past ? <span className="text-[13px] leading-5 text-muted">· и ещё {past} {pluralRu(past, ["прошедший", "прошедших", "прошедших"])}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={(event) => setAnchor(anchor ? null : event.currentTarget)} aria-expanded={Boolean(anchor)}>
          + День…
        </Button>
        {years.map((y) => {
          const kz = kzFixedHolidays(y);
          return (
            <Button key={y} size="sm" variant="ghost" disabled={kz.every((day) => days.includes(day))} onClick={() => add(kz)}>
              + Праздники Казахстана {y}
            </Button>
          );
        })}
      </div>
      <Popover open={Boolean(anchor)} onClose={() => setAnchor(null)} anchor={anchor} width={320} label="Выбрать праздник">
        <div className="p-3">
          <Calendar
            value={null}
            min={today}
            onPick={(day) => {
              add([day]);
              setAnchor(null);
            }}
          />
        </div>
      </Popover>
    </div>
  );
}

/** A reaction's price: its name, the points it pays. */
function ReactionPrice({ code, value, onChange }: { code: (typeof REACTION_CODES)[number]; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-2.5 border-b border-border/60 py-0.5">
      <span className="min-w-0 flex-1 text-[14px] leading-5">{REACTION_LABEL[code]}</span>
      <NumberInput label={`Очков за ${REACTION_LABEL[code]}`} value={value} max={100000} unit="очк." width={110} onChange={onChange} />
    </label>
  );
}

/**
 * «Сотрудники» on the desk: the points' rules (D-133, D-152) — on/off and who sees the rating, what
 * a task, the daily report and the director's reactions pay, what goes to Эфир — and the daily
 * report's days and times (D-152, D-155 §7, the director's). The people themselves are «Команда».
 */
export function TeamPanel({ director }: { director: boolean }) {
  const { draft, server, update } = useDraft();
  const rules = draft.points_rules;
  const saved = server.points_rules;
  const setRules = (patch: Partial<Rules>) => update({ points_rules: { ...rules, ...patch } });
  const report = draft.daily_report;
  const setReport = (patch: Partial<Report>) => update({ daily_report: { ...report, ...patch } });
  const off = !draft.points_enabled;

  return (
    <div className="flex flex-col gap-8">
      <SettingsGroup
        id="points"
        title="Очки и рейтинг"
        about="Очки начисляются сами за задачи, отчёты и реакции; директор добавляет свои. Тратятся в магазине."
        action={
          director ? (
            <Link href="/desk/settings/points" className="text-[13px] font-medium underline underline-offset-2">
              Балансы и магазин
            </Link>
          ) : null
        }
      >
        <SettingRow id="points-enabled" label="Очки включены" hint="Без них нет рейтинга, начислений и штрафов; магазин работает" htmlFor="set-points-enabled" changed={draft.points_enabled !== server.points_enabled}>
          <Switch id="set-points-enabled" label="Очки включены" checked={draft.points_enabled} onChange={(points_enabled) => update({ points_enabled })} />
        </SettingRow>
        <SettingRow id="rating-mode" label="Кто видит рейтинг целиком" hint="Директор всегда видит полный список" muted={off} changed={draft.rating_mode !== server.rating_mode}>
          <Segmented
            label="Кто видит рейтинг целиком"
            value={draft.rating_mode}
            onChange={(rating_mode) => update({ rating_mode })}
            items={[
              { value: "top5", label: "Топ-5 всем" },
              { value: "full", label: "Весь список всем" },
            ]}
          />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="points-task" title="Сами за задачу" about={off ? "Очки выключены — правила хранятся и заработают, когда их включат." : "Приходят без участия директора, на шагах задачи."}>
        <SettingRow id="points-quick" label="Принял быстро" hint={`Нажал «Принял» в первые ${rules.quick_accept_min} мин после пуша`} muted={off} changed={rules.quick_accept !== saved.quick_accept}>
          <NumberInput label="Очков за быстрое «Принял»" value={rules.quick_accept} unit="очк." onChange={(quick_accept) => setRules({ quick_accept })} />
        </SettingRow>
        <SettingRow id="points-quick-min" label="Быстро — это" hint="Сколько минут после пуша считаются быстрым ответом" muted={off} changed={rules.quick_accept_min !== saved.quick_accept_min}>
          <NumberInput label="Минут на «Принял»" value={rules.quick_accept_min} min={1} max={240} unit="мин" onChange={(quick_accept_min) => setRules({ quick_accept_min })} />
        </SettingRow>
        <SettingRow id="points-on-time" label="Сдал в срок" hint="Очки приходят, когда директор принял работу" muted={off} changed={rules.on_time !== saved.on_time}>
          <NumberInput label="Очков за сдачу в срок" value={rules.on_time} unit="очк." onChange={(on_time) => setRules({ on_time })} />
        </SettingRow>
        <SettingRow id="points-early" label="Сдал досрочно" hint="В первой половине срока — вместо «в срок»" muted={off} changed={rules.early !== saved.early}>
          <NumberInput label="Очков за досрочную сдачу" value={rules.early} unit="очк." onChange={(early) => setRules({ early })} />
        </SettingRow>
        <SettingRow
          id="points-late"
          label="Штраф за просрочку"
          hint="Не снимается с тех, кто в отпуске или на больничном. Сотрудник может оспорить"
          htmlFor="set-points-late"
          muted={off}
          changed={rules.late_on !== saved.late_on || rules.late !== saved.late}
        >
          <span className={rules.late_on ? "" : "pointer-events-none opacity-40"}>
            <NumberInput label="Очков штрафа за просрочку" value={rules.late} unit="очк." onChange={(late) => setRules({ late })} />
          </span>
          <Switch id="set-points-late" label="Штраф за просрочку" checked={rules.late_on} onChange={(late_on) => setRules({ late_on })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="points-report" title="За отчёт за день" about="Только в рабочие дни. Штрафуем только тех, кто уже сдал хотя бы один отчёт; в отпуске и на больничном — нет.">
        <SettingRow id="points-report-plus" label="+ за сданный" hint="Первая сдача за рабочий день" muted={off} changed={rules.daily_report !== saved.daily_report}>
          <NumberInput label="Очков за сданный отчёт" value={rules.daily_report} unit="очк." onChange={(daily_report) => setRules({ daily_report })} />
        </SettingRow>
        <SettingRow id="points-report-minus" label="− за несданный" hint="Утром за прошедший день; можно оспорить" muted={off} changed={rules.daily_report_missed !== saved.daily_report_missed}>
          <NumberInput label="Очков штрафа за несданный отчёт" value={rules.daily_report_missed} unit="очк." onChange={(daily_report_missed) => setRules({ daily_report_missed })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="points-reactions" title="Реакция директора на задачу" about="Реакция платит свою цену; 0 — реакция без очков. Сменил реакцию — разница доплачивается или списывается.">
        <SettingRow id="points-reactions-prices" label="Цена реакций" stack muted={off} changed={!same(rules.reactions, saved.reactions)}>
          <div className="desk-cells grid grid-cols-2 gap-x-8">
            {REACTION_CODES.map((code) => (
              <ReactionPrice key={code} code={code} value={rules.reactions[code]} onChange={(value) => setRules({ reactions: { ...rules.reactions, [code]: value } })} />
            ))}
          </div>
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup id="points-ether" title="В Эфир — всей команде" about="Хорошие новости, которые видит вся команда. Минусы в Эфир не попадают никогда.">
        <SettingRow id="ether-merch" label="Выдача наград" hint="«Айгуль — Брендовая куртка» после «Выдал»" htmlFor="set-ether-merch" muted={off} changed={draft.ether_events.merch !== server.ether_events.merch}>
          <Switch id="set-ether-merch" label="Выдача наград в Эфир" checked={draft.ether_events.merch} onChange={(merch) => update({ ether_events: { ...draft.ether_events, merch } })} />
        </SettingRow>
        <SettingRow id="ether-praise" label="Похвала директора" hint="При «Начислить» можно снять галочку «Сказать в Эфире»" htmlFor="set-ether-praise" muted={off} changed={draft.ether_events.praise !== server.ether_events.praise}>
          <Switch id="set-ether-praise" label="Похвала директора в Эфир" checked={draft.ether_events.praise} onChange={(praise) => update({ ether_events: { ...draft.ether_events, praise } })} />
        </SettingRow>
      </SettingsGroup>

      {director ? (
        <SettingsGroup
          id="report"
          title="Ежедневный отчёт"
          about="В конце дня сотрудник пишет, когда пришёл и ушёл и чем занимался; задачи дня попадают в отчёт сами."
          action={
            <Link href="/desk/reports" className="text-[13px] font-medium underline underline-offset-2">
              Читать отчёты
            </Link>
          }
        >
          <SettingRow
            id="report-enabled"
            label="Отчёты включены"
            hint={
              server.daily_report.enabled
                ? "Выключите — ни напоминаний, ни очков, ни штрафов"
                : "Штрафы начнутся с сегодняшнего дня, не задним числом; штрафуем только тех, кто уже сдал хотя бы один отчёт"
            }
            htmlFor="set-report-enabled"
            changed={report.enabled !== server.daily_report.enabled}
          >
            <Switch id="set-report-enabled" label="Отчёты включены" checked={report.enabled} onChange={(enabled) => setReport({ enabled })} />
          </SettingRow>
          <SettingRow id="report-days" label="Рабочие дни" hint="В другие дни отчёт сдать можно — без очков и без штрафа" muted={!report.enabled} changed={!same(report.workdays, server.daily_report.workdays)}>
            <Weekdays days={report.workdays} onChange={(workdays) => setReport({ workdays })} />
          </SettingRow>
          <SettingRow id="report-holidays" label="Праздники" hint="В эти дни отчёт не нужен: ни +, ни напоминания, ни штрафа. Курбан айт и переносы выходных добавьте сами" stack muted={!report.enabled} changed={!same(report.holidays, server.daily_report.holidays)}>
            <Holidays days={report.holidays} onChange={(holidays) => setReport({ holidays })} />
          </SettingRow>
          <SettingRow id="report-times" label="День начинается · напомнить" hint="Начало дня — подсказка «Пришёл» в форме; напоминание — пуш тем, кто не сдал" htmlFor="set-report-start" muted={!report.enabled} changed={report.work_start !== server.daily_report.work_start || report.remind_at !== server.daily_report.remind_at}>
            <TimeInput id="set-report-start" label="День начинается в" value={report.work_start} onChange={(work_start) => setReport({ work_start })} />
            <span className="text-[13px] text-muted">напомнить в</span>
            <TimeInput label="Напомнить про отчёт в" value={report.remind_at} onChange={(remind_at) => setReport({ remind_at })} />
          </SettingRow>
        </SettingsGroup>
      ) : null}

      <GroupNote>
        Люди, роли и пароли — в разделе{" "}
        <Link href="/desk/team" className="font-medium text-text underline underline-offset-2">
          «Команда»
        </Link>
      </GroupNote>
    </div>
  );
}
