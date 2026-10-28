# tasks/021-daily-report.md — Ежедневный отчёт (D-152)

> Наряд на три параллельные сессии: **тимлид**, **бэк**, **фронт**. Контракт ниже заморожен; типы — `lib/daily-report/types.ts`, имена и аргументы RPC — уже в `lib/supabase/types.ts` (секция Functions). Отступить от контракта можно только если иначе нельзя — тогда сделать ближайшее и написать отступление в отчёте.

## Что хочет владелец (2026-10-28, дословно по смыслу)

Сотрудник в конце рабочего дня сдаёт через приложение ежедневный отчёт: во сколько пришёл и ушёл, чем занимался; все его закрытые за день задачи попадают в отчёт сами. У директора — страница отчётов: кто что сделал сегодня, активность; за период — продуктивность команды. Сданный отчёт — автоматически **+1** очко, несданный — автоматически **−10**.

## Правила модуля (приняты исполнителем по умолчанию, всё настраивается в `company.settings`; ждут визы владельца)

1. **Кто сдаёт:** команда (`team_role()`: employee, manager, shopkeeper, secretary), `is_active`. Директор и ТВ не сдают.
2. **Какой день:** день — календарный день Asia/Aqtobe. Экран даёт сдать и править **только сегодняшний** отчёт, до 23:59 местного; повторная сдача — правка (upsert), очки второй раз не платятся. Задним числом — нельзя. *Уточнение 2026-10-28:* сервер принимает и отчёт за вчера (день — по местной дате `arrived_at`), если утренний тик этот день ещё не закрыл (`checked_on` < дня) и строки за него нет, — так сданный без сети в 23:58 доезжает утром, а не теряется под штрафом (принцип 5, DoD «Оффлайн»).
3. **Что в отчёте:** «Пришёл» и «Ушёл» (время сегодняшнего дня, ушёл > пришёл), «Чем занимался» (текст 1…4000 символов, обязателен), задачи дня — сами: задачи человека со статусом `pending_review` или `done`, у которых сдача (`completed_at`) или приёмка директором (`closed_at`, только `done`) пришлась на этот день. При сдаче список сохраняется снимком в отчёт (`tasks` jsonb); экран до сдачи показывает живой список.
4. **Рабочие дни:** `settings.daily_report.workdays`, ISO-дни недели, по умолчанию `[1,2,3,4,5]` (пн–пт). В нерабочий день отчёт сдать можно, очков нет, штрафа нет.
5. **+1:** при первой сдаче отчёта за рабочий день, если `points_enabled`. Правило `points_rules.daily_report` (по умолчанию 1), строка `point_transactions` `source='auto_rule'`, `rule_code='daily_report'`, причина «отчёт за день 28.10».
6. **−10:** утренний тик `daily_reports_due_missed` (крон `/api/push/sweep`, на Hobby — раз в сутки в 03:00 UTC = 08:00 Aqtobe) за каждый прошедший рабочий день без отчёта пишет строку `daily_reports` со статусом `missed` и, если `points_enabled`, минус `points_rules.daily_report_missed` (по умолчанию 10, хранится положительным, пишется со знаком минус, как `late`), `rule_code='daily_report_missed'`, причина «не сдан отчёт за 27.10». Не штрафуются: в отпуске/на больничном (`availability <> 'active'` на момент тика, как D-133 п.2), неактивные, пришедшие позже этого дня (`profiles.created_at` после конца дня), дни до `settings.daily_report.started_on`. Глубина — не дальше 7 дней назад. Минус оспаривается кнопкой «Оспорить» из D-133 п.5 — ничего строить не надо, это обычная отрицательная строка.
6a. **Закрытый день не перепроверяется** (уточнение 2026-10-28, после ревью тимлида): тик пишет `settings.daily_report.checked_on` — последний закрытый день — и смотрит только дни после него (не глубже 7). Вернувшегося из отпуска не штрафуют за отпуск, правка `workdays` не штрафует прошлое. Закрытый день без строки у директора — `away`.
7. **Старт без штрафа задним числом:** `started_on` (дата) — с какого дня считаются штрафы. Пусто → первый же тик записывает туда сегодняшний день и никого не штрафует. Включение модуля в «Настройках» (выкл → вкл) ставит `started_on` = сегодня.
8. **Напоминание:** тик `daily_report_reminders_due` в `settings.daily_report.remind_at` (по умолчанию «18:00» местного) по рабочим дням шлёт пуш «Сдайте отчёт за день» тем, кто сегодня обязан и ещё не сдал, один раз в день на человека, тап — `/report`. Через существующий outbox `notification_deliveries` и тихие часы доставки. (На Hobby крон суточный — напоминание заработает с минутным кроном; это нормально, тик всё равно нужен.)
9. **Приватность:** отчёт видит автор и директор своей компании. Другие сотрудники и секретарь чужих отчётов не видят. Минус никогда не публичен (Эфир, стена, бегущая строка — нет, D-45); плюс +1 тоже не идёт на стену (авто-бонус, D-133 п.7).
10. **Выключатель:** `settings.daily_report.enabled`, по умолчанию **true**. Выключен — нет напоминаний, штрафов, +1; экран сотрудника говорит «Отчёты выключены».

## База (бэк)

Миграция `supabase/migrations/20261028120000_daily_reports.sql` (RLS — в ней же; правки старых миграций запрещены):

```sql
create table daily_reports (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies,
  user_id           uuid not null references profiles,
  report_date       date not null,                 -- Asia/Aqtobe day
  status            text not null check (status in ('submitted','missed')),
  arrived_at        timestamptz,
  left_at           timestamptz,
  summary           text,
  tasks             jsonb not null default '[]',   -- DailyReportTask[] snapshot
  submitted_at      timestamptz,
  client_request_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, report_date),
  check (status = 'missed' or (arrived_at is not null and left_at is not null and left_at > arrived_at
         and submitted_at is not null and length(trim(summary)) between 1 and 4000))
);
-- index (company_id, report_date); moddatetime(updated_at); RLS on;
-- select: company_id = auth_company_id() and (user_id = auth.uid() or auth_role() = 'director')
-- no insert/update/delete policies: writes only through the security definer functions below
alter table point_transactions add column daily_report_id uuid references daily_reports;
create unique index point_transactions_daily_report_key
  on point_transactions (daily_report_id, rule_code) where daily_report_id is not null;
```

Функции (`security definer`, `set search_path = public`, company-фильтр по профилю вызывающего; jsonb в формах `lib/daily-report/types.ts`):

| Функция | Кто | Возвращает |
|---|---|---|
| `my_daily_report(p_date date default null)` | команда | `MyDailyReportDay` (null-дата = сегодня) |
| `submit_daily_report(p_arrived_at timestamptz, p_left_at timestamptz, p_summary text, client_request_id uuid default null)` | команда | `SubmitDailyReportResult` |
| `my_daily_report_history(p_limit int default 30)` | команда | `DailyReportHistoryItem[]` |
| `team_daily_report_day(p_date date default null)` | директор | `TeamDay` |
| `team_daily_report_period(p_from date, p_to date)` | директор | `TeamPeriod` (≤ 92 дня) |
| `daily_reports_due_missed(p_now timestamptz default now())` | service role (крон) | int — сколько записано |
| `daily_report_reminders_due(p_now timestamptz default now())` | service role (крон) | int — сколько поставлено в очередь |

Ошибки — `raise exception '<код>'` с кодами из `DailyReportError`; чужая роль — как в соседних RPC (`forbidden`). `execute` на `*_due` — только `service_role`. Правило очков в базе читает `points_rule(settings, 'daily_report', 1)` / `points_rule(settings, 'daily_report_missed', 10)`; модульные настройки — `settings -> 'daily_report'` с дефолтами из п. 4, 7, 8, 10. Идемпотентность: upsert по `(user_id, report_date)` + уникальный индекс очков; `client_request_id` пишется в строку.

Проверь до написания: что `tv_events_points`, `ether_events_*`, `fn_rating`, `tv_rating` делают с новыми строками `auto_rule` без `task_id` (ожидание: стена/Эфир их не берут, рейтинг считает как баланс); как соседние `*_due` ставят пуш в outbox (`deadline_reminders_due`, миграция `20260926120000_task_lifecycle.sql`) и что нужно новому виду пуша (`delivery_category`, слова пуша, `lib/push/policy.ts`).

## Сервер вне базы (бэк)

- `lib/settings.ts`: `DailyReportSettingsSchema` = `{ enabled: true, workdays: [1..5], work_start: "09:00", remind_at: "18:00", started_on: string|null }` в `CompanySettingsSchema` (`daily_report`, `prefault({})`) и в `SettingsPatchSchema` (partial); в `PointsRulesSchema` — `daily_report` (0…1000, 1) и `daily_report_missed` (0…1000, 10). Тесты в `lib/settings.test.ts`.
- Роут настроек (`app/api/settings/route.ts`): включение `daily_report.enabled` false→true ставит `started_on` = сегодня (Asia/Aqtobe); `started_on` с клиента не принимается.
- `app/api/push/sweep/route.ts`: тики `daily_reports_due_missed` (в начале, до доставки) и `daily_report_reminders_due` (рядом с `deadline_reminders_due`); в `Tick` и в ответе.
- Новый вид пуша `daily_report_remind`: слова, категория, политика — по образцу `deadline_soon` (`lib/push/*`), ссылка `/report`.
- `lib/supabase/types.ts`: строки таблицы `daily_reports` и колонка `point_transactions.daily_report_id` (секция Functions уже вписана контрактом — не трогать).

## Экраны (фронт)

Язык — как «Задачи»/«Мои дела» (D-83, D-88), шапка `PageHead`, скелет `loading.tsx` (D-122), тёмная тема и токены DESIGN, мобильный-first, ≤ 3 кнопок на действие. Данные — TanStack Query через `supabase.rpc(DAILY_REPORT_RPC.*)` в `lib/daily-report/queries.ts`; живое обновление у директора — `useRealtimeQuery` по `daily_reports` с фильтром `company_id`. Сдача — через существующую оффлайн-очередь (`lib/outbox.ts`), с `client_request_id`: без сети отчёт уходит потом ровно один раз.

1. **`/report` — сотрудник, «Отчёт за день».**
   - Сверху дата («Вторник, 28 октября») и состояние: «Не сдан» / «Сдан в 18:04 · +1» / «Выходной — можно сдать, без очков» / «Отчёты выключены».
   - «Пришёл» и «Ушёл» — два поля времени, предзаполнены `suggest`; длительность «8 ч 40 мин» под ними.
   - «Закрыл сегодня» — задачи дня (`tasks`) строками: название, «принята» / «на приёмке», «в срок» / «после срока»; тап — экран задачи. Пусто — «Сегодня ничего не сдано — напишите, чем занимались».
   - «Чем занимался» — растущее поле, обязательно.
   - Кнопка «Сдать отчёт» (после сдачи — «Сохранить» для правки до конца дня). Успех — game feel поверх (`EffectsLayer`, +1, если пришло), не блокируя.
   - Ниже — «Прошлые отчёты»: `my_daily_report_history`, строка дня: дата, «сдан · 8 ч 40 мин · 3 задачи · +1» или «не сдан · −10»; тап раскрывает на месте.
   - Вход: в «Делах» (`/tasks`) — заметная строка-кнопка «Отчёт за день» с состоянием (сдан ✓ / не сдан), в профиле — строка «Мои отчёты»; пуш-напоминание открывает `/report`. В таб-баре `SECTIONS`: `/report` → `/tasks`.
2. **`/reports` — директор, «Отчёты».** Две вкладки: «День» и «Период».
   - «День»: переключатель даты (‹ сегодня ›), сводка «Сдали 7 из 12 · не сдали 2 · в отпуске 1 · сдано задач 15 · принято 9»; список людей по `state`: аватар, имя, «пришёл 9:05 — ушёл 18:10 · 9 ч», задач N, значок состояния; тап раскрывает на месте: «Чем занимался», задачи дня, активность («принял 3 · сдал 2 · принято 2 · сообщений 5»). Живое: новый отчёт появляется без перезагрузки.
   - «Период»: «Неделя / Месяц / свой» (from–to); сверху итоги команды (доля сданных, сдано задач, принято, часы) и полоса по дням (столбики сданных/несданных — CSS, Recharts не вносить); ниже таблица людей: доля сдачи, ср. приход/уход, ср. часы, сдал/принято, в срок/после, очки за отчёты; сортировка тапом по заголовку. Тап по человеку — его дни за период (можно переиспользовать «День» с фильтром — на усмотрение).
   - Вход: строка «Отчёты» в «Настройках» директора рядом с «Рейтинг» / «Данные» (как D-113); `SECTIONS.director`: `/reports` → `/settings`. Доступ к `/reports` — только директор (охрана маршрута как у соседних директорских экранов).
3. **Настройки:** в «Настройках» директора — блок «Ежедневный отчёт»: выключатель, рабочие дни чипами пн…вс, «Напомнить в» (время), «+ за сданный» и «− за несданный» (рядом с остальными `points_rules`, если там их редактор). Сохраняется существующим PATCH настроек.

## Владение файлами (чужое не трогать; соседняя сессия может править репозиторий — не откатывать чужие изменения)

- **Бэк:** `supabase/migrations/20261028120000_daily_reports.sql`, `lib/settings.ts`, `lib/settings.test.ts`, `app/api/settings/**`, `app/api/push/sweep/route.ts`, `lib/push/**`, `lib/supabase/types.ts` (только Tables/колонка).
- **Фронт:** `app/report/**`, `app/reports/**`, `components/daily-report/**`, `lib/daily-report/*` кроме `types.ts`, `components/TabBar.tsx` (только `SECTIONS`), точка входа в `/tasks`, строка в профиле, строка и блок в «Настройках» (`components/settings/**`, `lib/settings-tabs.ts`), охрана маршрутов (`proxy.ts` / layout — где это сделано у соседей).
- **Тимлид:** `DECISIONS.md` (D-152 + строка в «Сейчас действует» + «Ждёт владельца»), `docs/DATABASE.md`, `docs/BACKEND.md`, `docs/FRONTEND.md`, `docs/CONCEPT.md` (если там список модулей), `IDEAS.md` («Входящие»), `supabase/tests/048_daily_reports.test.sql`, `WORKLOG.md`; ревью диффа бэка и фронта.
- **Общий:** `lib/daily-report/types.ts` — контракт; правит только оркестратор.

## Правила процесса (для всех трёх)

- Работаем в `Z:\Pulse` на `main`. Без worktree, без новых веток, без переключения веток. **Не коммитить, не пушить, `supabase db push` и любое применение миграции к dev — запрещено** (нужна явная команда владельца).
- **pnpm не запускать совсем** (даже `pnpm typecheck` ставит пакеты). Проверки — через node:
  ```
  node node_modules/typescript/bin/tsc --noEmit -p .
  node node_modules/eslint/bin/eslint.js <свои файлы>
  node node_modules/vitest/vitest.mjs run <свои тесты>
  ```
- Комментарии в коде — английские, тексты UI — русские, без упоминаний клиента (WAG). Плотность и стиль комментариев — как в соседнем коде.
- Перед отчётом — `git status --short`: перечисли свои файлы. Идеи и техдолг вне скоупа — строкой в `IDEAS.md` «Входящие» через тимлида (в отчёте).
