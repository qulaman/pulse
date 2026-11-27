"use client";

import { CalendarPlus, Plus, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { RatingRules, ShopRules } from "@/components/desk/points/Rules";
import { GroupLink, GroupNote, SettingRow, SettingsGroup, TimeInput } from "@/components/desk/settings/form";
import { Popover } from "@/components/desk/ui/Popover";
import { Switch } from "@/components/desk/ui/Switch";
import { useDraft } from "@/components/settings/draft";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/datetime/Calendar";
import { kzFixedHolidays } from "@/lib/daily-report/holidays";
import { parseYmd, todayYmd, WEEKDAYS_SHORT_RU, type Ymd } from "@/lib/datetime/calendar";
import type { CompanySettings } from "@/lib/settings";
import { pluralRu } from "@/lib/tasks/status-text";

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
    <div role="group" aria-label="Рабочие дни" className="seg set-days inline-flex h-9 items-center gap-0.5 p-0.5">
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
            className={`set-day flex h-8 w-7 items-center justify-center text-[13px] font-semibold leading-4 transition-colors duration-[140ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${
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
            <span key={day} className="set-chip nums inline-flex h-6 items-center text-[13px] leading-4">
              {label}
              <button
                type="button"
                aria-label={`Убрать праздник ${label}`}
                onClick={() => onChange(days.filter((d) => d !== day))}
                className="set-chip-x flex h-6 w-5 items-center justify-center text-muted hover:text-danger"
              >
                <X size={14} aria-hidden />
              </button>
            </span>
          );
        })}
        {upcoming.length === 0 ? <span className="text-[13px] leading-5 text-muted">Впереди праздников нет</span> : null}
        {past ? <span className="text-[13px] leading-5 text-muted">· и ещё {past} {pluralRu(past, ["прошедший", "прошедших", "прошедших"])}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={(event) => setAnchor(anchor ? null : event.currentTarget)} aria-expanded={Boolean(anchor)} icon={<CalendarPlus size={16} />}>
          День…
        </Button>
        {years.map((y) => {
          const kz = kzFixedHolidays(y);
          return (
            <Button key={y} size="sm" variant="ghost" disabled={kz.every((day) => days.includes(day))} onClick={() => add(kz)} icon={<Plus size={14} />}>
              Праздники Казахстана {y}
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

/**
 * The «team» tab of the desk's settings. The director's is «Отчёты»: the daily report's days and
 * times (D-152, D-155 §7) and the morning brief — the points' rules and the shop's setting live in
 * «Рейтинг» and «Магазин» (D-215), a note leads there. The secretary has neither section, so her
 * tab keeps those rows (D-104). The people themselves are «Команда».
 */
export function TeamPanel({ director }: { director: boolean }) {
  const { draft, server, update } = useDraft();
  const report = draft.daily_report;
  const setReport = (patch: Partial<Report>) => update({ daily_report: { ...report, ...patch } });

  return (
    <div className="flex flex-col gap-6">
      {director ? null : (
        <>
          <RatingRules />
          <ShopRules />
        </>
      )}

      {director ? (
        <SettingsGroup
          id="report"
          title="Ежедневный отчёт"
          about="В конце дня сотрудник пишет, когда пришёл и ушёл и чем занимался; задачи дня попадают в отчёт сами."
          action={<GroupLink href="/desk/reports">Читать отчёты</GroupLink>}
        >
          <SettingRow
            id="report-enabled"
            label="Отчёты включены"
            hint={
              server.daily_report.enabled
                ? "Выключите — ни напоминаний, ни очков, ни штрафов"
                : "Штрафы начнутся с сегодняшнего дня, не задним числом; штрафуем только тех, кто уже сдал хотя бы один отчёт"
            }
            htmlFor="ctl-report-enabled-switch"
            changed={report.enabled !== server.daily_report.enabled}
          >
            {/* the row itself is `set-report-enabled` (the search lands there): the switch has an id of its own */}
            <Switch id="ctl-report-enabled-switch" label="Отчёты включены" checked={report.enabled} onChange={(enabled) => setReport({ enabled })} />
          </SettingRow>
          <SettingRow id="report-days" label="Рабочие дни" hint="В другие дни отчёт сдать можно — без очков и без штрафа" muted={!report.enabled} changed={!same(report.workdays, server.daily_report.workdays)}>
            <Weekdays days={report.workdays} onChange={(workdays) => setReport({ workdays })} />
          </SettingRow>
          <SettingRow id="report-holidays" label="Праздники" hint="В эти дни отчёт не нужен: ни +, ни напоминания, ни штрафа. Курбан айт и переносы выходных добавьте сами" stack muted={!report.enabled} changed={!same(report.holidays, server.daily_report.holidays)}>
            <Holidays days={report.holidays} onChange={(holidays) => setReport({ holidays })} />
          </SettingRow>
          <SettingRow id="report-times" label="День начинается · напомнить" hint="Начало дня — подсказка «Пришёл» в форме; напоминание — пуш тем, кто не сдал" htmlFor="ctl-report-start" muted={!report.enabled} changed={report.work_start !== server.daily_report.work_start || report.remind_at !== server.daily_report.remind_at}>
            <TimeInput id="ctl-report-start" label="День начинается в" value={report.work_start} onChange={(work_start) => setReport({ work_start })} />
            <span className="text-[13px] text-muted">напомнить в</span>
            <TimeInput label="Напомнить про отчёт в" value={report.remind_at} onChange={(remind_at) => setReport({ remind_at })} />
          </SettingRow>
          <SettingRow id="report-ask" label="Пульс просит отчёт с" hint="С этого часа на Пульсе сотрудника заметна строка «Отчёт за день не сдан», и лицо зовёт его сдать — без пуша" htmlFor="ctl-report-ask-at" muted={!report.enabled} changed={report.ask_from !== server.daily_report.ask_from}>
            <TimeInput id="ctl-report-ask-at" label="Пульс просит отчёт с" value={report.ask_from} onChange={(ask_from) => setReport({ ask_from })} />
          </SettingRow>
        </SettingsGroup>
      ) : null}

      {director ? (
        <SettingsGroup
          id="morning"
          title="Утренняя сводка"
          about={`Каждому — его дела на сегодня и встречи одним пушем в ${draft.delivery_window.from}, в начале окна доставки, в рабочие дни «Ежедневного отчёта»; нажал — открылся Пульс.`}
        >
          <SettingRow
            id="morning-brief"
            label="Утренняя сводка сотрудникам"
            hint="«2 дела на сегодня, 1 просрочено · встреча в 15:00»; пустой день — без пуша"
            htmlFor="ctl-morning-brief"
            changed={draft.morning_brief.enabled !== server.morning_brief.enabled}
          >
            <Switch id="ctl-morning-brief" label="Утренняя сводка сотрудникам" checked={draft.morning_brief.enabled} onChange={(enabled) => update({ morning_brief: { enabled } })} />
          </SettingRow>
        </SettingsGroup>
      ) : null}

      <GroupNote>
        {director ? (
          <>
            Правила очков и рейтинга — в разделе{" "}
            <Link href="/desk/rating?view=rules" className="font-medium text-text underline underline-offset-2" data-testid="settings-to-rating-rules">
              «Рейтинг»
            </Link>
            , настройки магазина — в{" "}
            <Link href="/desk/shop?focus=ether-merch" className="font-medium text-text underline underline-offset-2">
              «Магазине»
            </Link>
            .{" "}
          </>
        ) : null}
        Люди, роли и пароли — в разделе{" "}
        <Link href="/desk/team" className="font-medium text-text underline underline-offset-2">
          «Команда»
        </Link>
      </GroupNote>
    </div>
  );
}
