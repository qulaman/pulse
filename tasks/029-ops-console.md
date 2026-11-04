# tasks/029-ops-console.md — Консоль разработчиков `/ops` (D-157)

Контракт для параллельной сборки. Типы и схемы — `lib/ops/contract.ts` (заморожен: менять только через ведущего). Код — английские комментарии, интерфейс — русский.

## Что строим

Раздел `/ops` вне любой компании, только для разработчиков: реестр компаний и карточка, создание компании и директора, смена директора, вход и сессии людей, чистка и удаление компании с выгрузкой, правки из закрытого списка, журнал. Только компьютер.

## Как устроена защита

1. **Оператор** — пользователь `auth.users`, у которого есть строка `ops.operators` без `revoked_at` и нет строки `profiles`. Признак положительный: «нет профиля» ничего не значит.
2. **Сессия своя:** cookie `OPS_COOKIE` (`lib/ops/contract.ts`), `httpOnly`, `sameSite: strict`. Браузерного Supabase-клиента в консоли нет: всё идёт через `/api/ops/*`.
3. **Чтение** — RPC `public.ops_*` под JWT оператора (`authenticated`), первая строка каждой — `ops.assert(43200)`.
4. **Запись** — по билету. `ops_ticket` (под JWT) проверяет оператора, свежесть TOTP, причину и выдаёт одноразовый билет на 60 секунд. Пишущие `ops_*` доступны только `service_role`, первая строка — `ops.take(...)`, последняя — `ops.log(...)`. Без настоящей сессии оператора билет не получить, поэтому забытая проверка в маршруте дырой не становится. Под service role `auth.uid()` пуст: защитные триггеры работают как у тика.
5. **Тишина:** `ops.take` ставит `set_config('pulse.ops_quiet','1',true)`, и `notification_deliveries_deliver_after` гасит строку так же, как `muted`. Служебная правка пушей не шлёт.
6. **Журнал** `ops.audit` append-only: триггеры запрещают UPDATE, DELETE, TRUNCATE.
7. **Адрес:** необязательный env `OPS_HOST`. Задан — `/ops` и `/api/ops` отвечают 404 на любом другом хосте. Заголовки на `/ops`: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `X-Robots-Tag: noindex`, `Cache-Control: no-store`.
8. **Устройство:** `/ops` не попадает в офлайн-копию `public/sw.js` и в снимок IndexedDB; глобальные монтирования (`SessionWatch`, `OutboxReplay`, `MediaReplay`, `ErrandReplay`, `PushSync`, `SecretaryAlarmGate`, `MascotPower`, `AppUpdate`, `OfflineBanner`) на `/ops` не работают.

## База: миграция `supabase/migrations/20261104130000_ops_console.sql`

Схема `ops` (вне PostgREST), таблицы с RLS без политик и без грантов:
- `ops.operators(user_id pk → auth.users on delete cascade, note, created_at, revoked_at)`
- `ops.tickets(id uuid pk, operator_id, session_id, action, company_id, target jsonb, reason, client_request_id unique, created_at, taken_at)`
- `ops.audit(id bigint identity pk, at, operator_id, session_id, action, company_id, company_name, target jsonb, reason, client_request_id unique, result jsonb)` без FK
- `ops.company_requests(client_request_id pk, director_id, tv_id, created_at)` — заготовленные id, чтобы повтор создания шёл теми же людьми
- `ops.storage_queue(id bigint identity pk, company_id, bucket, name, queued_at)`; строка удаляется, когда файл снят
- `ops.exports(id uuid pk, company_id, operator_id, created_at, finished_at, sha256, counts jsonb)`

Функции `ops`: `assert(p_fresh_seconds int) returns table(operator_id uuid, session_id uuid)` — порядок проверок: `auth.uid()`; `session_id` из `auth.jwt()` не пуст; оператор без `revoked_at`; строки `profiles` нет; `auth.sessions` есть, `aal='aal2'`, не просрочена; самая свежая `auth.mfa_amr_claims` с `authentication_method='totp'` не старше `p_fresh_seconds`. Ошибки: `ops_denied`, `ops_fresh_required`. `take(p_ticket, p_action, p_company) returns ops.tickets`: билет не взят, совпали действие и компания, моложе 60 с, иначе `ops_bad_ticket`; ставит `taken_at` и тишину. `log(ticket, result jsonb)`.

Доступны `authenticated` (остальное отозвать, включая default ACL):
- `ops_login_state() → jsonb {operator bool}` — единственная без `ops.assert`, под aal1, ничего не раскрывает кроме своего статуса
- `ops_ticket(p_action text, p_company uuid, p_target jsonb, p_reason text, p_client_request_id uuid) → jsonb {ticket uuid} | {duplicate true, result jsonb}`. Причина короче 5 символов — `reason_required`. Свежий TOTP (300 с) требуется для всех действий, кроме `create_company`, `add_person`, `revoke_sessions` (43200 с). `crid` уже в журнале → `duplicate`; билет не взят → тот же билет с новым `created_at`.
- `ops_companies() → jsonb` (`CompanyRow[]`), `ops_company_card(p_company) → jsonb` (`CompanyCard` без `usd`), `ops_company_footprint(p_company) → jsonb` (`Footprint`), `ops_audit_list(p_before bigint, p_limit int, p_company uuid) → jsonb`, `ops_operators() → jsonb`

Только `service_role`, первая строка `ops.take`, кроме отмеченных:
- `ops_slug_free(p_slug) → boolean`, `ops_prepare_company(p_ticket) → jsonb {director_id, tv_id}` — без `take`, сверяют билет только на существование
- `ops_create_company(p_ticket, p_payload jsonb) → jsonb`: `companies` (settings только явные), `profiles` директора и киоска `TV Kiosk`, `shop_items` из `payload.shop`, `tv_state`
- `ops_log_action(p_ticket, p_action, p_company, p_result jsonb) → void` — для действий, выполняемых не в базе
- `ops_add_person(p_ticket, p_company, p_user, p_full_name, p_role, p_position, p_aliases text[]) → void`
- `ops_update_company(p_ticket, p_company, p_name, p_slug, p_settings jsonb) → void`: `settings || patch`, ключ `parser_rules` отклонить
- `ops_update_person(p_ticket, p_company, p_user, p_patch jsonb) → void`: только `full_name, position, role, is_active`; директора и в директора — `use_change_director`
- `ops_revoke_sessions(p_ticket, p_company, p_user) → jsonb {sessions, devices}` — тело `revoke_sessions` без проверки роли
- `ops_adjust_points(p_ticket, p_company, p_user, p_amount, p_reason) → jsonb {balance}`: `source='manual'`, `rule_code='ops_adjust'`, `quiet=true`, `actor_id=null`; строку не менять, только новая (принцип 4). Отрицательный баланс разрешён: это поправка.
- `ops_change_director(p_ticket, p_company, p_old, p_new, p_old_fate) → jsonb` (см. ниже)
- `ops_task_get(p_ticket, p_company_or_null, p_task) → jsonb`, `ops_update_task(p_ticket, p_company, p_task, p_patch jsonb) → void`, `ops_delete_task(p_ticket, p_company, p_task) → void` (тело `delete_task`)
- `ops_wipe_activity(p_ticket, p_company, p_confirm_name) → jsonb`, `ops_purge_company(p_ticket, p_company, p_confirm_name) → jsonb`
- `ops_export_begin(p_ticket, p_company) → uuid`, `ops_export_page(p_export, p_table, p_offset, p_limit) → jsonb`, `ops_export_files(p_export, p_offset, p_limit) → jsonb`, `ops_export_finish(p_export, p_sha256, p_counts) → void`. Без `take` после begin; выгрузка живёт 30 минут. Таблицы — белый список без `notes`, `mind_boards` (приватны по D-75), `login_codes`, `login_attempts`, `push_subscriptions`, `notification_deliveries`. Порядок — `ctid`, `offset`.
- `ops_storage_next(p_limit) → jsonb`, `ops_storage_done(p_ids bigint[]) → void`, `ops_storage_left(p_company) → int` — без билета, это уборка
- `ops_grant_operator(p_user, p_note) → void`, `ops_revoke_operator(p_user) → void` — только для `scripts/ops-grant.ts`; пишут журнал с `operator_id=null`; отзыв удаляет сессии

Другие правки в этой миграции:
- `login_codes.issued_by` без NOT NULL; `issue_login_code`: при `p_issued_by is null` проверка выдающего пропускается. Функция уже только для service role.
- `notification_deliveries_deliver_after`: тишина `pulse.ops_quiet`.
- недостающие индексы: `company_id` у таблиц, где FK без индекса; FK на `profiles` без индекса.
- Каскады не добавлять.

**Смена директора.** Одна транзакция. Роль нового = `director`. `tasks.author_id` старого → новый у `scheduled, sent, accepted, in_progress, pending_review, rework, declined`. Активные `recurrence_rules.author_id`, будущие `events.author_id` (и участие going), `profiles.manager_id`, снять доски старого с `tv_state` (`board_id`, `week_board_id`, `board_point`), открытые `errands` старого — `cancelled`, строка `system` в тред перенесённых задач. Все изменённые id — в `result` журнала. `old_fate`: `deactivate` — `is_active=false` (сессии гасит `trg_profiles_deactivated`), `demote` — роль `employee`, `keep` — без изменений. Остаются: done и revoked, сообщения, реакции, очки, объявления, отчёты, `notes`, `mind_boards`, `notification_prefs`.

**Чистка активности** (`ops_wipe_activity`): проверка `p_confirm_name = companies.name`, иначе `confirm_mismatch`. Одна транзакция, порядок ниже без шагов 1 и 10–11, без `push_subscriptions`, `notification_prefs`, `login_codes`, `voice_kept`, `shop_items`. `tv_state` сбрасывается в эфир (`mode='ether'`, `employee_id, task_id, expires_at, board_id, week_board_id, board_point` = null, `guest=false`, `guest_until=null`), `stock` открытых заказов возвращается, `streak_count` и `streak_updated_at` людей обнуляются. Файлы компании из `storage.objects` (`voice`, `photos`), кроме отмеченных `voice_kept`, — в `ops.storage_queue`.

**Удаление компании** (`ops_purge_company`): требует `ops.exports` с `finished_at` за последние 24 часа, иначе `export_required`. Одна транзакция:
1. `companies … FOR UPDATE`, файлы всех бакетов в очередь, список людей.
2. `tv_state`.
3. `notification_deliveries`, `push_subscriptions`, `notification_prefs`, `login_codes`, `voice_kept`, `tv_events`, `reminders`.
4. `ether_events`, `point_disputes`, `point_transactions`, `daily_reports`.
5. `orders`, затем `shop_items`.
6. `mind_boards`, затем `notes`.
7. `announcements`.
8. `tasks` одним DELETE.
9. `events`, `errands`, `visits`, `recurrence_rules`, `inbox_items`, `ai_logs`, `ingest_batches`.
10. `profiles` одним DELETE, затем `auth.users`.
11. `companies`, журнал. Постусловие: ноль строк по `company_id` во всех таблицах, иначе raise.

## API `/api/ops/*`

`lib/ops/handler.ts`: `withOps(spec, fn)`. Порядок: `OPS_HOST`; на не-GET обязателен `Origin` с совпадением хоста (отсутствие — отказ); cookie-клиент; zod; если в `spec.action` — `ops_ticket`, `duplicate` возвращает сохранённый `result` с `duplicate:true`. Ошибки: `ops_denied` → 401 `unauthorized`, `ops_fresh_required` → 428 `fresh_required`. Формат ошибок — `apiError`. `fn` получает `{ req, db, service, ticket, body, params }`, где `db` — клиент под JWT оператора, `service` — `createServiceSupabase()`.

| Метод, путь | Тело → ответ (`contract.ts`) |
|---|---|
| POST `auth/login` | `LoginBody` → `LoginAnswer`; не оператор — выход и тот же ответ, что на неверный пароль |
| POST `auth/enroll` | → `EnrollAnswer` |
| POST `auth/verify` | `VerifyBody` → `VerifyAnswer`; и первый вход, и повторное подтверждение |
| POST `auth/logout` | → `{ok:true}` |
| GET `me` | → `MeAnswer` |
| GET `companies` | → `CompaniesAnswer` |
| POST `companies` | `CreateCompanyBody` → `CreateCompanyAnswer` |
| GET `companies/[id]` | → `CompanyCard` (добавляет `usd` через `lib/ai/pricing.ts`) |
| PATCH `companies/[id]` | `UpdateCompanyBody` → `UpdateCompanyAnswer` |
| GET `companies/[id]/footprint` | → `Footprint` |
| POST `companies/[id]/people` | `AddPersonBody` → `AddPersonAnswer` |
| POST `companies/[id]/director` | `ChangeDirectorBody` → `ChangeDirectorAnswer` |
| POST `companies/[id]/task-lookup` | `TaskLookupBody` → `TaskLookupAnswer` |
| POST `companies/[id]/wipe` | `WipeBody` → `WipeAnswer` (после RPC сразу дренаж файлов) |
| POST `companies/[id]/purge` | `PurgeBody` → `PurgeAnswer` |
| POST `companies/[id]/export` | `ExportStartBody` → `ExportStartAnswer` |
| GET `exports/[id]/page?table=&offset=` | → `ExportPageAnswer` (страница 500) |
| GET `exports/[id]/files?offset=` | → `ExportFilesAnswer` (страница 50, подпись на 30 минут) |
| POST `exports/[id]/finish` | `ExportFinishBody` → `ExportFinishAnswer` |
| POST `storage/drain` | → `DrainAnswer` |
| PATCH `people/[id]` | `UpdatePersonBody` → `UpdatePersonAnswer` |
| POST `people/[id]/login-code` | `PersonLoginBody` → `PersonLoginAnswer` |
| POST `people/[id]/sessions` | `RevokeSessionsBody` → `RevokeSessionsAnswer` |
| POST `people/[id]/points` | `AdjustPointsBody` → `AdjustPointsAnswer` |
| PATCH `tasks/[id]` | `UpdateTaskBody` → `UpdateTaskAnswer` |
| POST `tasks/[id]/delete` | `DeleteTaskBody` → `DeleteTaskAnswer` |
| GET `audit?before=&company=` | → `AuditAnswer` |
| GET `operators` | → `OperatorsAnswer` |

Создание компании: `ops_ticket` → `ops_slug_free` → `ops_prepare_company` → `auth.admin.createUser({ id })` директора и киоска (id уже есть — идём дальше, чужая почта — 409 `email_exists`) → `ops_create_company` → код через `issue_login_code` с `p_issued_by=null`. Сбой на RPC — удалить созданных в этом запросе. Витрина — общая константа `lib/company/starter.ts`. `settings` — только `parser` по выбору и `points_enabled`.

Выдача кода: `ops_ticket` → `ops_log_action` → `issue_login_code(null)`. `app/api/people/[id]/login-code` GET должен пережить `issued_by = null`.

## Экраны

`data-surface="desk"`. Переиспользовать `components/desk/ui`: `DataGrid, Popover, Menu, Tooltip, Dialog, Shortcuts, Toolbar, StatTile, Light, Num, PageTitle, EmptyState, DeskPanel, SectionLabel, SettingRow`. Не брать: `DeskShell, SideNav, TopBar, DeskLinks, PersonCell`, `components/admin/DataTable`.

- `/ops/login`: пароль, затем QR и код при первом входе, иначе код.
- `/ops`: реестр: компания, активные/люди, последний вход, последний разбор, ошибки, очередь, упало; кнопка «Новая компания».
- `/ops/new`: форма, после создания экран с кодом и QR директора.
- `/ops/c/[id]`: шапка, «Люди» (меню строки: выдать код, сбросить сессии, изменить, очки), «Директор», «Настройки» (название, адрес, модель разбора, очки, лаба), «Задача» (поиск по id; показ только после причины и кода), «Данные» (объёмы, «Очистить», «Выгрузить», «Удалить компанию»).
- `/ops/log`: журнал. `/ops/operators`: список, только чтение.

Любое действие — диалог с полем причины (`components/ops/ReasonField`). Опасные — ввод названия компании. Предпросмотр чистки — из `footprint`. Выгрузка в папку через `showDirectoryPicker` (только Chrome/Edge — честный текст, если API нет): постранично таблицы в `<table>.ndjson`, файлы в `files/<bucket>/<name>`, `manifest.json` с числами, SHA-256 манифеста через WebCrypto, затем `finish`.

Клиент — `lib/ops/client.ts`: `opsFetch` сам показывает диалог кода при 428 (регистрирует `registerFreshPrompt` рамка консоли). `QueryClient` консоли свой, вложенный: без офлайн-режима и без повторов мутаций.

## Убрать

Кнопку «Обнулить демо-базу» у директора: `app/api/admin/reset-demo`, `lib/admin/reset-demo*`, `components/settings/DemoReset.tsx`, её места в `SettingsTabs.tsx`, `components/desk/settings/**`, `lib/desk/settings-queries.ts`. `scripts/db-clean.ts`: добавить `point_disputes`, `ether_events`, `daily_reports`, чтобы он не падал.

## Правила для всех исполнителей

- Рабочая папка `Z:\Pulse`, ветка `main`. Worktree не создавать. Не коммитить, не переключать ветки.
- `pnpm` не запускать вообще. Проверки: `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js <пути>`, `node node_modules/vitest/vitest.mjs run <пути>`.
- Трогать только свои файлы. Нужна правка чужого или контракта — напиши об этом в отчёте.
- dev-база только на чтение: `POST https://api.supabase.com/v1/projects/qobsbjugromdwfdodwwa/database/query/read-only`, токен `SUPABASE_ACCESS_TOKEN` из `.env.local`. Миграции не применять, смоуки и `next dev` не запускать.
- Сигнатуры RPC не в `lib/supabase/types.ts`, пока миграция не применена: вызовы — через `lib/ops/db.ts`.
