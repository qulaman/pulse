# tasks/026-daily-report-soft-start.md — Ежедневный отчёт: штраф только после первого сданного, возврат ранних штрафов, праздники компании, «Чем занимался» — в день без задач

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай. Идею или техдолг вне скоупа не делай — запиши одной строкой в `IDEAS.md`, раздел «Входящие» (с номером наряда).

## Зачем (D-155 п.1 и п.7)

1. **Модуль штрафует команду, которая его ещё не видела.** На dev к 2026-11-03 — 27 минусов по −10 у 9 человек, сданных отчётов — 0. Решение владельца: минус за несданный отчёт ставится только тому, кто до этого дня сдал хотя бы один отчёт. Строка `missed` пишется как раньше: директор видит пропуск в «Отчётах». Уже списанные ранние минусы возвращаются проводкой-возвратом.
2. **Праздников у компании нет** — в Наурыз отчёт обязателен. Нужен список дат `settings.daily_report.holidays`: праздник — нерабочий день. Отчёт сдать можно, но без +1, без напоминания и без штрафа.
3. **«Чем занимался» обязателен, даже если задачи дня уже в отчёте**, — лишний ввод (принцип 1). Решение: поле обязательно только в день без задач.

Контракт настроек уже заморожен архитектором — **не трогать**:
- `lib/settings.ts`: `DailyReportSettingsSchema.holidays` — массив `YYYY-MM-DD`, уникальный и отсортированный; битый список читается как пустой. Ключ есть и в `DailyReportPatchSchema`.
- `lib/settings.test.ts` — тесты схемы.
- `components/settings/draft.tsx`: `holidays` уже входит в `reportKeys`, «несохранённое» его видит.

## Контекст (читать только это)
- `CLAUDE.md` — принципы 1, 4, 7.
- `DECISIONS.md` — **только** D-155 (п.1, п.7) и D-152 (п.4–п.7 и п.11).
- `supabase/migrations/20261028120000_daily_reports.sql` — все функции модуля. Тела копировать отсюда, это последние версии; проверь: `grep -l "function daily_reports_due_missed\|function submit_daily_report\|function daily_report_workday\|function my_daily_report(" supabase/migrations/*.sql`.
- `supabase/migrations/20261014120000_points_game.sql` — `point_disputes`, RPC «Оспорить» (около строки 380) и решение директора по спору (около строки 425).
- `supabase/tests/048_daily_reports.test.sql` — образец фикстур и то, что сейчас проверяется про штраф.
- `lib/daily-report/types.ts`, `lib/daily-report/format.ts` (`formProblem`), `components/daily-report/MyReportView.tsx`, `components/daily-report/ReportHistory.tsx`, `app/api/daily-report/route.ts`.
- `components/settings/sections.tsx` — `DailyReportSection` (около строки 743) и подписи про штраф в `PointsSection` (около строки 580).
- Где сотруднику предлагается «Оспорить» минус: `grep -rn "Оспорить" components lib --include=*.tsx --include=*.ts`.
- Как гонять pgTAP на dev без применения миграции — запись D-152 в `WORKLOG.md` (2026-10-28, «Проверки») и раннер `C:\Users\Turing\AppData\Local\Temp\claude\z--Pulse\3d751caa-a971-4773-a7cb-88da461ab6f9\scratchpad\run-pgtap.mjs`: `node run-pgtap.mjs <test.sql> [migration.sql…]` гоняет тест внутри отката, `--sql "<query>"` — чтение.

## Владение файлами (чужое не трогать)

| Наряд | Файлы |
|---|---|
| **026 (этот)** | `supabase/migrations/20261103120000_daily_report_soft_start.sql` (метка закреплена за тобой), `supabase/tests/050_daily_report_soft_start.test.sql`, `supabase/tests/048_daily_reports.test.sql` (только ожидания, изменённые D-155), `lib/daily-report/**`, `components/daily-report/**`, `app/report/**`, `app/api/daily-report/**`, `components/settings/sections.tsx`, компонент и RPC «Оспорить» (только скрыть или отказать для возвращённого минуса) |
| 027 (параллельно) | `supabase/migrations/20261103121000_voice_retention.sql`, `supabase/tests/051_voice_retention.test.sql`, `app/api/push/sweep/route.ts`, `lib/voice/retention*.ts`, `components/settings/VoiceRetentionSection.tsx`, `components/settings/SettingsTabs.tsx`, `app/lab/**`, `components/lab/**`, плееры голоса |
| 028 (параллельно) | `components/ui/StillLogo.tsx` (+ тест), `components/AppHeader.tsx`, `components/auth/Arrival.tsx`, `components/auth/LoginForm.tsx`, `components/tv/TvClock.tsx`, `components/settings/CompanyForm.tsx` |
| Архитектор | `DECISIONS.md`, `docs/**`, `lib/settings.ts`, `lib/settings.test.ts`, `components/settings/draft.tsx` |
| Сессия десктопа (D-154, идёт сейчас) | `app/desk/**`, `components/desk/**`, `lib/desk/**`, `app/globals.css`, `docs/DESIGN.md`, `scripts/smoke-desk.ts`, `proxy.ts`, `components/TabBar.tsx`, `components/profile/**` |

**Общие для всех:** `WORKLOG.md` — одна запись в конец файла; `IDEAS.md` — только новые строки в конец «Входящих». Перед каждой правкой файл перечитать: соседи пишут туда же. Доки (`docs/*.md`) не трогать: какие фразы в них поменять, напиши в отчёте, правит архитектор.

## Шаги

1. **Миграция** `supabase/migrations/20261103120000_daily_report_soft_start.sql`. В каждой функции — `create or replace` с той же сигнатурой, тело — копия текущего плюс правка; grant-ы `create or replace` сохраняет.
   - `daily_report_workday(p_settings, p_day)`: день — не рабочий и тогда, когда `p_settings -> 'daily_report' -> 'holidays'` — массив, а в нём строка `to_char(p_day, 'YYYY-MM-DD')`. Сравнение строк через `@>`, без приведения к `date`: битая строка в настройках не должна ронять тик. Остальные функции — тик, напоминание, `+1` в `submit_daily_report`, состояние дня и периода — читают рабочий день через неё и праздник узнают сами. Проверь `grep`-ом, что прямого `isodow` в обход неё нет.
   - `daily_reports_due_missed`: строка `missed` пишется как раньше. Минус ставится только тем строкам, у чьего человека есть `daily_reports` со `status = 'submitted'` и `report_date` раньше дня пропуска. Остальное в функции не менять.
   - `submit_daily_report`: `summary_required` — только если слова пусты **и** `jsonb_array_length(daily_report_tasks(v_company, v_user, v_day)) = 0`. Пустые слова при задачах дня сохраняются как `''`. Проверь, как `summary` хранится и читается: `not null`, `daily_report_json`. Если пустое значение что-то ломает, СТОП и вопрос.
   - `my_daily_report`: поле `penalty` — сколько стоит пропуск **этому человеку**: `0`, пока у него нет ни одного сданного отчёта до сегодняшнего дня. Новое поле `holiday boolean` — сегодня в списке праздников. Тип в `lib/daily-report/types.ts` поправить.
   - **Возврат ранних штрафов** — функция `daily_report_refund_early_fines() returns int`, `security definer`, только `service_role`. Для каждой строки `point_transactions` с `rule_code = 'daily_report_missed'` и `amount < 0`:
     - пропустить, если у человека был сданный отчёт раньше дня этого штрафа (`daily_reports` по `daily_report_id`) — по новому правилу такой штраф правильный;
     - пропустить, если минус уже возвращён спором — `point_disputes.refund_id is not null`;
     - иначе вставить `+abs(amount)`: `source = 'auto_rule'`, `rule_code = 'daily_report_missed_refund'`, тот же `daily_report_id`, причина «возврат штрафа за DD.MM: до первого отчёта не штрафуем».
     Повтор безвреден: `on conflict (daily_report_id, rule_code) where daily_report_id is not null do nothing`. В конце миграции — `select daily_report_refund_early_fines();`. Возврат — `auto_rule`, поэтому на стену и в Эфир он не идёт (`tv_events_points` и `ether_events_praise` пропускают `auto_rule`); проверь это `grep`-ом.
   - **Возвращённый минус не оспаривается.** RPC «Оспорить» на минус, у которого есть строка `daily_report_missed_refund` с тем же `daily_report_id`, отвечает `already_refunded` (`P0001`). Тело RPC — копия текущего плюс эта проверка.
   - `daily_report_json`: если у отчёта есть строка возврата, минус показывается возвращённым — тем же полем, каким сейчас показан возврат через спор. Не нашёл такого поля — СТОП и вопрос.
2. **`lib/daily-report/holidays.ts`** — праздники Казахстана с постоянной датой на год, функция `kzFixedHolidays(year: number): string[]`. Даты: 1 и 2 января, 7 января, 8 марта, 21–23 марта, 1, 7 и 9 мая, 6 июля, 30 августа, 25 октября, 16 декабря. Курбан айта и переносов выходных в списке нет: их директор добавляет сам. Тест рядом — `holidays.test.ts`.
3. **Экран сотрудника** — `MyReportView.tsx`, `format.ts`:
   - `formProblem` не требует слов, если у дня есть задачи. Подпись над полем — «Чем занимался», при задачах дня — с припиской «необязательно — задачи дня уже в отчёте». Если сервер всё же ответил `summary_required`, разбор остаётся как сейчас. Тесты `format.test.ts` дополнить.
   - В праздник (`holiday`) экран говорит «Праздник — отчёт сегодня не нужен» там же и тем же видом, каким сейчас говорит о нерабочем дне.
   - Если экран или напоминание где-то обещает «−10 за несданный», а для этого человека `penalty = 0`, обещание не показывать. Подпись — «Пока не сдан первый отчёт, пропуск не штрафуется».
   - В «Прошлых отчётах» возвращённый минус — как возвращённый, тем же видом, что возврат по спору. Кнопки «Оспорить» на нём нет.
4. **«Настройки → Сотрудники → Ежедневный отчёт»** (`DailyReportSection` в `sections.tsx`):
   - Под рабочими днями — строка «Праздники». Чипами — даты с сегодняшней и дальше, например «21 мар, сб ×»: тап по «×» убирает дату. Прошедшие даты остаются в списке, но не показываются: только строкой «и ещё N прошедших». Удалять их нельзя: по ним считаются прошлые дни в «Периоде».
   - Поле даты и «Добавить».
   - Кнопка «+ Праздники Казахстана {год}» — текущий год, а с 1 ноября и следующий: добавляет `kzFixedHolidays` без повторов. Рядом мелко: «Курбан айт и переносы выходных добавьте сами».
   - Сохраняется тем же `SectionActions`, что и остальной блок, ключом `holidays` в `daily_report`.
   - Подсказку к выключателю, начинающуюся с «Штрафы начнутся с сегодняшнего дня…», и строку «Очки: +N за сданный, −M за несданный» дополнить: «штрафуем только тех, кто уже сдал хотя бы один отчёт».
   - Блок показывается и на десктопе: `components/desk/settings/SettingsPanels.tsx` импортирует `DailyReportSection`. Экспорт и пропсы не менять.
5. **`WORKLOG.md`**: `## 2026-11-03 — Исполнитель (Opus) — 026 daily-report-soft-start` + Сделано / Проверки / Не проверено / Вопросы / Доки (какие фразы где поменять).

## Проверки (обязательные, машинные; pnpm не запускать совсем)

```powershell
node node_modules/typescript/bin/tsc --noEmit -p .
node node_modules/eslint/bin/eslint.js lib/daily-report components/daily-report app/report app/api/daily-report components/settings/sections.tsx
node node_modules/vitest/vitest.mjs run lib/daily-report lib/settings.test.ts
```

- **pgTAP на dev — только внутри откатываемой транзакции вместе с новой миграцией, миграцию на dev НЕ применять.**
  - `050_daily_report_soft_start` — свои фикстуры: своя компания, очки включены, штраф 10, два человека. Проверки:
    - тик за прошедший рабочий день пишет обоим `missed`, минус — только тому, у кого раньше был сданный отчёт;
    - праздник: тик не пишет `missed`, напоминание не ставится, сдача в праздник проходит без +1;
    - пустые слова: при задаче дня (`done` за этот день) сдача проходит, без задач — `summary_required`;
    - `daily_report_refund_early_fines()`: вернёт ранний минус, не тронет правильный и уже возвращённый спором; повторный вызов вставит 0 строк;
    - «Оспорить» возвращённый минус → `already_refunded`.
  - `048_daily_reports`: ожидания, которые поменял D-155 (минус человеку без сданных отчётов), правишь по новому правилу, с комментарием `-- D-155 п.1`. Остальные проверки 048 не трогаешь, они зелёные.
  - `041_points_game`, `039_point_balances` — вывод с миграцией и без одинаков: на dev есть известные падения из-за данных, сравнивай «до/после».
  - После прогона dev не тронут: `select prosrc like '%daily_report_missed_refund%' from pg_proc where proname = 'daily_report_json'` → `false`.
  - Возвратов на dev у `rule_code = 'daily_report_missed_refund'` — 0.
- **Экраны глазами** — системный Chrome через Playwright (как в `scripts/smoke-stages.ts`), ширина 390, скриншоты в свою папку scratchpad:
  - `/report` под `aigul@demo.local` — пароль как в смоуках;
  - «Настройки → Сотрудники» под `test@demo.local`.
  На dev **ничего не сохранять и не сдавать**: база общая с владельцем, сохранение и сдачу проверяют pgTAP и vitest. Пушей не слать. Если вход не пускает (код по умолчанию, D-135), пиши в отчёт «не проверено глазами» и почему. Обходить вход нельзя.
- tsc: ошибки в чужих файлах (соседи работают параллельно) не чинить, перечислить в отчёте. В своих — 0.

Красная проверка = чинить в рамках скоупа, не расширяя его.

## Вне скоупа наряда (не делать; идеи — в `IDEAS.md`, «Входящие», с пометкой «026»)
- Включить штраф на dev обратно — владелец, в «Настройках».
- Праздники для других стран, Курбан айт по лунному календарю, переносы выходных.
- «Праздник» на экранах директора («День», «Период») отдельной подписью — состояние `off` как у выходного остаётся.
- Десктоп (`components/desk/**`) — не трогать даже ради подписи.
- Доки, `DECISIONS.md`, `lib/settings.ts`, `components/settings/draft.tsx` — у архитектора.
- Коммит, `db push`, применение миграции на dev, ветки, worktree — не делать.
