"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";

import { Toggle } from "@/components/lab/LabPanel";
import { Disclosure } from "@/components/ui/Disclosure";
import {
  ACTIVITY,
  estimateCost,
  PARSER_CONTEXT,
  perClientInFleet,
  PLATFORM_MONTHLY,
  PRICES_CHECKED,
  ROSTER_CAP,
  SUPABASE,
  type CacheTtl,
  type CostKey,
  type Quota,
} from "@/lib/lab/costs";
import { usePeople } from "@/lib/people/queries";

const RU = "ru-RU";

function num(value: number, digits: number): string {
  return value.toLocaleString(RU, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** $0,58 · $29 · $1 076 */
function usd(value: number): string {
  return `$${num(value, value < 10 ? 2 : 0)}`;
}

/** A single call: $0,0123 — cents would round it to nothing. */
function usdFine(value: number): string {
  return value < 0.1 ? `$${num(value, 4)}` : usd(value);
}

function whole(value: number): string {
  return num(Math.round(value), 0);
}

function gb(value: number): string {
  if (value < 1) return `${whole(value * 1024)} МБ`;
  return `${num(value, value < 10 ? 1 : 0)} ГБ`;
}

function millions(value: number): string {
  const digits = value % 1e6 === 0 ? 0 : value < 1e6 ? 2 : 1;
  return `${num(value / 1e6, digits)} млн`;
}

function percent(part: number, total: number): string {
  return `${whole(total > 0 ? (part / total) * 100 : 0)}%`;
}

/**
 * Categorical slots for the cost bar, checked for colour-blind separation and contrast on
 * the dark card (dataviz validator). The app's own tokens sit above the dark lightness band,
 * so the series have their own steps; text never wears them.
 */
const LINES: Record<CostKey, { label: string; hint: string; color: string }> = {
  compute: { label: "Сервер БД", hint: "свой проект Supabase у клиента", color: "#3987e5" },
  supabase: { label: "Трафик и файлы", hint: "egress, realtime, хранилище", color: "#c98500" },
  vercel: { label: "Vercel", hint: "функции, cron, страницы", color: "#9085e9" },
  ai: { label: "ИИ", hint: "распознавание речи и разбор", color: "#1FA88F" },
};

const PRESETS = [
  { key: "s", label: "до 50", headcount: 50 },
  { key: "m", label: "50–200", headcount: 200 },
  { key: "l", label: "200+", headcount: 500 },
] as const;

function presetOf(headcount: number): (typeof PRESETS)[number]["key"] {
  return headcount <= 50 ? "s" : headcount <= 200 ? "m" : "l";
}

const THUMB = { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.9 };

const QUOTAS: Record<string, { label: string; amount: (q: Quota) => string; note: (q: Quota) => string }> = {
  prompt: {
    label: "Промпт парсера",
    amount: (q) => `${whole(q.used)} из ${whole(q.included)} токенов`,
    note: (q) => `${percent(q.used, q.included)} окна модели`,
  },
  connections: {
    label: "Realtime-подключения в пик",
    amount: (q) => `${whole(q.used)} из ${whole(q.included)}`,
    note: (q) => `${percent(q.used, q.included)} лимита проекта`,
  },
  disk: {
    label: "Диск БД: прирост за год",
    amount: (q) => `${gb(q.used)} из ${q.included} ГБ`,
    note: (q) => `хватит на ≈ ${whole(q.included / q.used)} лет`,
  },
  calls: {
    label: "Вызовы функций Vercel в месяц",
    amount: (q) => `${millions(q.used)} из ${millions(q.included)}`,
    note: (q) => `хватит на ≈ ${whole(q.included / q.used)} таких клиентов`,
  },
  credit: {
    label: "Кредит Vercel в месяц",
    amount: (q) => `${usd(q.used)} из ${usd(q.included)}`,
    note: (q) => `хватит на ≈ ${whole(q.included / q.used)} таких клиентов`,
  },
  egress: {
    label: "Трафик Supabase в месяц",
    amount: (q) => `${gb(q.used)} из ${q.included} ГБ`,
    note: (q) => `хватит на ≈ ${whole(q.included / q.used)} таких клиентов`,
  },
  realtime: {
    label: "Сообщения realtime в месяц",
    amount: (q) => `${millions(q.used)} из ${millions(q.included)}`,
    note: (q) => `хватит на ≈ ${whole(q.included / q.used)} таких клиентов`,
  },
  files: {
    label: "Файлы: прирост за год",
    amount: (q) => `${gb(q.used)} из ${q.included} ГБ`,
    note: (q) => `хватит на ≈ ${whole(q.included / q.used)} таких клиентов на год`,
  },
};

function HeadcountControls({
  headcount,
  onChange,
  ours,
}: {
  headcount: number;
  onChange: (value: number) => void;
  ours: number | null;
}) {
  const preset = presetOf(headcount);
  return (
    <>
      <div role="radiogroup" aria-label="Размер компании" className="seg grid grid-cols-3 gap-1 rounded-[14px] p-1">
        {PRESETS.map((p) => {
          const active = p.key === preset;
          return (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`cost-preset-${p.key}`}
              onClick={() => onChange(p.headcount)}
              className={`relative min-h-[40px] rounded-[10px] px-1 font-display text-[14px] font-semibold leading-[18px] tracking-[-0.01em] transition-colors duration-[120ms] ${
                active ? "text-text" : "text-muted active:text-text"
              }`}
            >
              {active ? <motion.span layoutId="cost-preset-thumb" transition={THUMB} className="seg-thumb absolute inset-0 rounded-[10px]" /> : null}
              <span className="relative z-[1]">{p.label}</span>
            </button>
          );
        })}
      </div>
      <label className="mt-4 block">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] font-medium leading-[18px] text-muted">Сотрудников в компании</span>
          <span className="nums text-[20px] font-semibold leading-6">{headcount}</span>
        </span>
        <input
          type="range"
          min={5}
          max={1000}
          step={5}
          value={headcount}
          onChange={(e) => onChange(Number(e.target.value))}
          data-testid="cost-headcount"
          className="mt-1 h-11 w-full cursor-pointer accent-accent"
        />
      </label>
      {ours !== null ? (
        <button
          type="button"
          onClick={() => onChange(ours)}
          className="mt-1 min-h-[34px] rounded-full border border-border bg-surface-2 px-3 font-display text-[13px] font-semibold leading-4 tracking-[-0.01em] transition-transform duration-[120ms] active:scale-[0.96]"
        >
          Как у нас сейчас · {ours}
        </button>
      ) : null}
    </>
  );
}

function CostBar({
  lines,
  total,
  active,
  onPick,
}: {
  lines: { key: CostKey; usd: number }[];
  total: number;
  active: CostKey | null;
  onPick: (key: CostKey | null) => void;
}) {
  const picked = active ? lines.find((l) => l.key === active) : null;
  return (
    <div>
      {/* the bar mirrors the legend below, which is the accessible control; a tap on a segment lights its row */}
      <div aria-hidden className="flex h-[14px] gap-[2px] overflow-hidden rounded-[4px]">
        {lines.map((line) => (
          <button
            key={line.key}
            type="button"
            tabIndex={-1}
            onClick={() => onPick(active === line.key ? null : line.key)}
            className="h-full min-w-[3px] transition-opacity duration-[160ms]"
            style={{
              flexGrow: line.usd,
              flexBasis: 0,
              background: LINES[line.key].color,
              opacity: active && active !== line.key ? 0.3 : 1,
            }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-col">
        {lines.map((line) => {
          const meta = LINES[line.key];
          const on = active === line.key;
          return (
            <li key={line.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onPick(on ? null : line.key)}
                className="-mx-2 flex min-h-[44px] w-[calc(100%+16px)] items-center gap-3 rounded-[10px] px-2 text-left transition-[background-color,opacity] duration-[120ms]"
                style={{
                  background: on ? "var(--surface-2)" : undefined,
                  opacity: active && !on ? 0.55 : 1,
                }}
              >
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: meta.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-5">{meta.label}</span>
                  <span className="block truncate text-[12px] leading-4 text-muted">{meta.hint}</span>
                </span>
                <span className="nums shrink-0 text-right">
                  <span className="block text-[15px] font-semibold leading-5">{usd(line.usd)}</span>
                  <span className="block text-[12px] leading-4 text-muted">{percent(line.usd, total)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {picked ? (
        <p className="sr-only" aria-live="polite">
          {LINES[picked.key].label}: {usd(picked.usd)}, {percent(picked.usd, total)}
        </p>
      ) : null}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-[12px] bg-surface-2 px-3 py-2.5">
      <div className="nums truncate text-[17px] font-semibold leading-[22px]">{value}</div>
      <div className="mt-0.5 text-[12px] leading-4 text-muted">{label}</div>
    </div>
  );
}

function Meter({ quota }: { quota: Quota }) {
  const meta = QUOTAS[quota.key];
  const share = quota.included > 0 ? quota.used / quota.included : 0;
  // status colours carry the state, and the words say it too
  const state = share >= 0.9 ? "danger" : share >= 0.6 ? "warn" : null;
  const fill = state === "danger" ? "var(--danger)" : state === "warn" ? "var(--warn)" : "var(--accent)";
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-[14px] font-medium leading-[18px]">{meta.label}</span>
        <span className="nums shrink-0 text-[13px] leading-4 text-muted">{meta.amount(quota)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full min-w-[2px] rounded-full" style={{ width: `${Math.min(100, share * 100)}%`, background: fill }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px] leading-4 text-muted">
        <span>
          {meta.note(quota)}
          {state ? (
            <span className="font-semibold" style={{ color: fill }}>
              {state === "danger" ? " · упор" : " · близко к пределу"}
            </span>
          ) : null}
        </span>
        <span className="shrink-0">{quota.scope === "project" ? "на клиента" : "общая на всех"}</span>
      </div>
    </li>
  );
}

function Line({ label, hint, value, strong }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className={`block text-[15px] leading-5 ${strong ? "font-semibold" : ""}`}>{label}</span>
        {hint ? <span className="block text-[12px] leading-4 text-muted">{hint}</span> : null}
      </span>
      <span className={`nums shrink-0 text-[15px] leading-5 ${strong ? "font-semibold" : ""}`}>{value}</span>
    </li>
  );
}

/**
 * «Себестоимость»: what one client instance costs to run by company size (lib/lab/costs.ts).
 * A slider for the headcount and two levers the owner has not decided yet — an hour-long
 * parser cache and a trimmed roster; every number below follows them.
 */
export function CostReport() {
  const people = usePeople();
  const ours = people.data ? people.data.filter((p) => p.is_active && p.role !== "tv").length : null;

  const [headcount, setHeadcount] = useState(50);
  const [cacheTtl, setCacheTtl] = useState<CacheTtl>("5m");
  const [trimRoster, setTrimRoster] = useState(false);
  const [active, setActive] = useState<CostKey | null>(null);

  const trim = trimRoster && headcount > ROSTER_CAP;
  const { e, now, hourSaves, trimSaves } = useMemo(() => {
    const e = estimateCost(headcount, { cacheTtl, trimRoster: trim });
    const now = estimateCost(headcount, { cacheTtl: "5m", trimRoster: false });
    const hourSaves = estimateCost(headcount, { cacheTtl: "5m", trimRoster: trim }).month - estimateCost(headcount, { cacheTtl: "1h", trimRoster: trim }).month;
    const trimSaves =
      estimateCost(headcount, { cacheTtl, trimRoster: false }).month - estimateCost(headcount, { cacheTtl, trimRoster: true }).month;
    return { e, now, hourSaves, trimSaves };
  }, [headcount, cacheTtl, trim]);

  const ai = e.lines.find((l) => l.key === "ai")?.usd ?? 0;
  const smallLines = e.lines.filter((l) => l.key === "vercel" || l.key === "supabase").reduce((s, l) => s + l.usd, 0);
  const gapMinutes = ACTIVITY.workMinutes / e.day.commands;
  const rosterLimit = Math.floor((PARSER_CONTEXT - ACTIVITY.promptBaseTokens) / ACTIVITY.rosterTokensPerEmployee);
  const changed = cacheTtl !== "5m" || trim;

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-4">
        <h2 className="eyebrow">Себестоимость одного клиента</h2>
        <div className="mt-3">
          <HeadcountControls headcount={headcount} onChange={setHeadcount} ours={ours} />
        </div>

        <div className="mt-5 flex items-baseline gap-2">
          <span className="nums text-[44px] font-bold leading-[48px] tracking-[-0.02em]" data-testid="cost-month">
            {usd(e.month)}
          </span>
          <span className="text-[15px] leading-5 text-muted">в месяц</span>
          {changed ? <span className="nums ml-auto text-[13px] leading-4 text-muted line-through">{usd(now.month)}</span> : null}
        </div>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          Сервер {e.compute.name} и расходы одной компании; подписки платформы — отдельно, ниже
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat value={usd(e.perEmployee)} label="на сотрудника" />
          <Stat value={usd(e.month / 30)} label="в день" />
          <Stat value={usd(e.year.total)} label="в год" />
        </div>

        <div className="mt-5">
          <CostBar lines={e.lines} total={e.month} active={active} onPick={setActive} />
        </div>

        <div className="mt-3 border-t border-border pt-2">
          <Toggle
            label="Кэш промпта на 1 час"
            hint={cacheTtl === "1h" ? `экономит ${usd(hourSaves)} в месяц` : "сейчас 5 минут — почти каждый разбор пишет кэш заново"}
            checked={cacheTtl === "1h"}
            onChange={(on) => setCacheTtl(on ? "1h" : "5m")}
          />
          {headcount > ROSTER_CAP ? (
            <Toggle
              label={`Ростер не больше ${ROSTER_CAP} человек`}
              hint={trim ? `экономит ${usd(trimSaves)} в месяц` : "в промпт только нужные люди, например отдел руководителя"}
              checked={trimRoster}
              onChange={setTrimRoster}
            />
          ) : null}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-[19px] font-semibold leading-6">Нагрузка на сервера</h2>
        <p className="mt-1 text-[13px] leading-4 text-muted">Активный день компании на {e.headcount} человек и что из тарифов он занимает</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat value={whole(e.day.tasks)} label={`задач в день · ${whole(e.day.commands)} команд`} />
          <Stat value={whole(e.day.rows)} label="новых строк в БД в день" />
          <Stat value={`${num(e.day.peakRps, 1)}/с`} label={`пик Vercel · ${whole(e.day.calls)} вызовов в день`} />
          <Stat value={gb(e.day.filesMb / 1024)} label="файлов в день: голос и фото" />
        </div>
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {e.quotas.map((q) => (
            <Meter key={q.key} quota={q} />
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="text-[19px] font-semibold leading-6">Если клиент один</h2>
        <p className="mt-1 text-[13px] leading-4 text-muted">Пилот: подписки платит одна компания, расходы на трафик влезают в то, что входит в тарифы</p>
        <ul className="mt-3 flex flex-col divide-y divide-border">
          <Line label="Vercel Pro" hint="одно место; расход функций входит в кредит $20" value={usd(e.alone.platform)} />
          <Line
            label="Supabase Pro"
            hint={`$${SUPABASE.org} + сервер ${e.compute.name} + dev − кредит $${SUPABASE.computeCredit}`}
            value={usd(e.alone.supabase)}
          />
          <Line label="ИИ" hint="распознавание речи и разбор команд" value={usd(e.alone.ai)} />
          <Line label="Итого в месяц" hint={`${usd(e.alone.total / 30)} в день · ${usd(e.alone.total * 12)} в год`} value={usd(e.alone.total)} strong />
        </ul>
        <h3 className="eyebrow mt-5">Когда клиентов много</h3>
        <p className="mt-1 text-[13px] leading-4 text-muted">
          Подписки ${PLATFORM_MONTHLY} в месяц делятся на всех; на каждого клиента такого размера:
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[1, 10, 100].map((k) => (
            <Stat key={k} value={usd(perClientInFleet(e, k))} label={k === 1 ? "1 клиент" : `${k} клиентов`} />
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-[19px] font-semibold leading-6">Что двигает цифры</h2>
        <ol className="mt-3 flex list-decimal flex-col gap-3 pl-5 text-[14px] leading-5 marker:font-semibold marker:text-muted">
          <li>
            <span className="font-semibold">ИИ — {percent(ai, e.month)} суммы.</span> Команды приходят раз в ~{whole(gapMinutes)} мин, в кэш
            попадает {percent(e.parser.cacheHit, 1)} разборов, разбор стоит {usdFine(e.parser.perParse)}.
            {cacheTtl === "5m" ? ` Кэш на час сэкономил бы ${usd(hourSaves)} в месяц.` : ""}
          </li>
          <li>
            <span className="font-semibold">Ростер растёт с компанией.</span> Каждый человек — ~{ACTIVITY.rosterTokensPerEmployee} токенов в
            промпте; сейчас {whole(e.parser.promptTokens)}. В окно модели ({whole(PARSER_CONTEXT)}) весь ростер не влезет на ~
            {whole(rosterLimit)} сотрудниках.
          </li>
          <li>
            <span className="font-semibold">Сервер БД у каждого клиента свой</span> ({e.compute.name}, {usd(e.compute.usd)}) — цена
            изоляции клиентов, от неё не уйти.
          </li>
          <li>
            <span className="font-semibold">Vercel, трафик и файлы — {percent(smallLines, e.month)}.</span> Экономить на них нет смысла.
          </li>
        </ol>
      </section>

      <section className="card p-4">
        <h2 className="text-[19px] font-semibold leading-6">Упоры при росте</h2>
        <ul className="mt-3 flex flex-col gap-3 text-[14px] leading-5">
          <li>
            <span className="font-semibold">Регион функций Vercel.</span> В vercel.json он не задан; если у проекта стоит регион по умолчанию
            (США), каждый запрос к базе во Франкфурте идёт через океан, а минутный cron делает восемь таких подряд. Нужен fra1.
          </li>
          <li>
            <span className="font-semibold">{SUPABASE.includedConnections} realtime-подключений на проект.</span> При{" "}
            {percent(ACTIVITY.peakOnline, 1)} людей онлайн в пик это ~{whole(SUPABASE.includedConnections / ACTIVITY.peakOnline)}{" "}
            сотрудников; дальше — снять лимит трат, $10 за каждую тысячу сверху.
          </li>
          <li>
            <span className="font-semibold">Подписки на изменения таблиц</span> проверяют права каждого подписчика на каждое изменение. До 500
            человек это доли сообщения в секунду; для 1000+ горячие каналы стоит перевести на Broadcast.
          </li>
          <li>
            <span className="font-semibold">Хранение данных в Казахстане.</span> Если клиент потребует хранить персональные данные в РК, база
            во Франкфурте не подходит — нужен свой сервер у казахстанского хостера. В расчёте его нет.
          </li>
          <li>
            <span className="font-semibold">Вопросы к данным</span> (этап 3) ещё не построены и в расчёт не входят: ориентир +$15–25 в месяц
            на директора при ~10 вопросах в день.
          </li>
        </ul>
      </section>

      <Disclosure title="Допущения и источники" summary={`Модель, не замер · цены на ${PRICES_CHECKED}`}>
        <div className="text-[13px] leading-[18px] text-muted">
          <p>
            Активный день: {num(ACTIVITY.tasksPerEmployee, 1)} задачи на сотрудника, у задачи {ACTIVITY.updatesPerTask} смен статуса,{" "}
            {ACTIVITY.messagesPerTask} сообщения и {ACTIVITY.deliveriesPerTask} уведомления; одна команда даёт{" "}
            {num(ACTIVITY.entitiesPerCommand, 1)} сущности, {percent(ACTIVITY.voiceShare, 1)} команд голосом по ~{ACTIVITY.commandAudioSec} с.
            Сотрудник открывает приложение {ACTIVITY.opensPerEmployee} раз в день и присылает {num(ACTIVITY.photosPerEmployee, 1)} фото;{" "}
            {ACTIVITY.announcementsPerDay} объявления в
            день; ТВ опрашивает базу 12 часов.
          </p>
          <p className="mt-2">
            Размеры строк — с dev-базы (с индексами и раздуванием от обновлений); голос 48 кбит/с, фото ≤1600 px. Промпт парсера —{" "}
            {whole(ACTIVITY.promptBaseTokens)} токенов плюс ~{ACTIVITY.rosterTokensPerEmployee} на человека (замер count_tokens). Трафик и
            realtime посчитаны по цене сверх квот, как будто общие квоты уже съедены другими клиентами, — с запасом. Точность по активности
            ±50%: ИИ меняется почти пропорционально числу команд, сервера — почти нет.
          </p>
          <p className="mt-2">
            Цены: vercel.com/pricing, supabase.com/pricing, Haiku 4.5 и gpt-4o-transcribe — lib/ai/pricing.ts. Расчёт — lib/lab/costs.ts.
          </p>
        </div>
      </Disclosure>
    </div>
  );
}
