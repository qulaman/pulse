# DATABASE.md — схема данных Pulse

Документ описывает базу Pulse в Supabase (Postgres 17): таблицы, RLS, функции, триггеры, бакеты, Realtime, миграции, сид и состав pgTAP-тестов. Он для агента с нарядом в этом слое и для разработчика, который входит в проект. Источник правды по схеме — миграции `supabase/migrations/`; каждую колонку даёт `lib/supabase/types.ts`. Соседи: роуты, доставка и тик — `docs/BACKEND.md` (доставка — §4, тик — §10); голосовой конвейер — `docs/AI.md`; запуск тестов — `docs/TESTING.md`; среды и применение миграций — `docs/SETUP.md`. Арбитр — `DECISIONS.md`.

## 1. Карта

| Где | Что |
|---|---|
| `supabase/migrations/` | вся схема; имя файла — метка `YYYYMMDDHHMMSS` и описание |
| `supabase/seed.sql` | dev-фикстуры, ставит pgTAP |
| `supabase/tests/` | pgTAP-тесты (§11) |
| `supabase/config.toml` | PostgREST отдаёт схемы `public` и `graphql_public`, схема `ops` наружу не видна |
| `lib/supabase/types.ts` | типы, генерирует `pnpm db:types` с dev-базы (только `public`) |
| `supabase/SCHEMA.md` | указатель: миграция и строка действующего определения каждого объекта; собирает `pnpm db:index` (`scripts/schema-index.ts`) |
| `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/service.ts` | клиенты: браузер, сервер от имени пользователя, service role |
| `lib/settings.ts` | схема `companies.settings` (§5) |
| `app/api/push/sweep/route.ts` | тик (§7.7) |

Функции пересоздавались много раз (`confirm_voice_batch` — восемь): живое тело — в последней миграции, которая её создаёт. Какая это миграция и на какой строке, говорит указатель `supabase/SCHEMA.md` (D-162): он же называет, где создана каждая таблица, политика, триггер и перечисление.

## 2. Правила слоя

1. **Одна база на всех клиентов (D-134).** У таблицы компании есть `company_id`, граница — RLS по нему; без него только дочерние `announcement_acks`, `event_participants`, а также `login_attempts` и схема `ops`. Пути в бакетах начинаются с `company_id`.
2. **`security definer` и service role обходят RLS.** Такая функция сама берёт компанию вызывающего (`auth_company_id()`) и сверяет с ней каждый id из параметров. «Чужое» и «не найдено» — один код ошибки.
3. **RLS на каждой таблице, по умолчанию запрет.** Политики — в той же миграции, что таблица; помощники в них — обёрнутыми `(select …)` (D-126).
4. **Баланс очков — сумма журнала (принцип 4).** `point_transactions` только дописывается, исправление — новая строка, сумму считает view `point_balances`. Магазин — hold-final (D-10).
5. **Время — `timestamptz` в UTC, на экране — Asia/Aqtobe.** Местное время SQL считает сам, где важен день или час компании. Просрочка вычисляется (`deadline < now()` при `sent`, `accepted`, `in_progress`, `rework`), колонки нет.
6. **Идемпотентность (принцип 7, G.3).** Мутации несут `client_request_id`: регистр `ingest_batches` (повтор отдаёт сохранённый результат с `duplicate: true`) или уникальный ключ строки (`notes`, `mind_boards`, `errands`, `visits`, `inbox_items`, `profiles`, `daily_reports`). Абсолютная команда ключа не несёт (D-76 §3), исключения — D-155 п.4.
7. **Запись в несколько таблиц — функцией `security definer` через `rpc()`;** статус задачи меняют только функции (D-39).
8. **Доставка — outbox (G.2, D-114).** База только вставляет строки в `notification_deliveries`; шлёт воркер `lib/push/send.ts`.
9. **Негатив не публичен (D-45), гость видит маску (D-33).** Стена и Эфир не несут отказов, просрочек, минусов; гостевая копия маскируется при записи.
10. **View — только обычные, `security_invoker` (G.1).** Схема меняется только новой миграцией (§11).

## 3. Типы

| Тип | Неочевидное |
|---|---|
| `user_role` | `director`, `manager`, `employee`, `shopkeeper` (завхоз), `tv` (пользователь киоска стены), `secretary`; «команда» — `team_role()`: все, кроме директора и `tv` |
| `availability_t` | `active`, `vacation`, `sick`; в отпуске и на больничном не штрафуют |
| `task_status` | `scheduled` — ждёт отправки, адресату невидима; `pending_review` — сдана; `done` — принята директором; `declined` — «Не могу»; `revoked` — отозвана; в `in_progress` переходов нет (D-04) |
| `message_type` | `text`, `voice`, `photo`; `status_change` пишет триггер; `system` — служебные строки функций |
| `point_source` | `manual`, `auto_rule`, `reaction`, `shop_hold`, `shop_release`; «выдачи» нет — hold финален |
| `delivery_status` | `queued`, `sent`, `failed`; заглушённая строка — `failed` с `last_error = 'muted'` |
| `inbox_status` | `recorded`, `transcribed`, `parsed`, `confirmed`; `discarded` код не ставит |

Из `delivery_channel` живёт только `push`, из `ai_log_kind` — `stt` и `parse`; `absence_kind` не используется. Прочие статусы — текст с `check`. Новое значение enum — отдельной миграцией.

## 4. Таблицы

Обычная строка: `id uuid`, `company_id`, `created_at`; `updated_at` двигает `moddatetime`. «Компания» в доступе — люди компании с живой сессией (§6).

### 4.1. Компании и люди

**`companies`** — клиент: `name`, `slug` (адрес компании в ссылке входа, D-135), `settings` (§5). Читает компания, кроме `tv`; создаёт и удаляет service role (`pnpm seed:client`, консоль).

**`profiles`** — человек, `id` из `auth.users`: `aliases` — формы имени для матчера (D-111); `manager_id` — подчинение глубиной 1; `is_active = false` — уволен; `away_until` — секретарь «не на месте до …» (D-99); `streak_count` — серия, пишет триггер (D-133); `client_request_id` уникален в компании (D-158); `telegram_chat_id` и `settings` не читаются. Читает компания, кроме `tv`, свою строку — каждый с живой сессией. Правят: сам — себя, директор — всех, секретарь — всех, кроме директоров (D-104), с оговорками §8.2. Создаёт и удаляет service role.

**`profile_phones`** — телефон отдельно: `profiles` читает вся компания (D-158). Читают директор, секретарь и сам; пишут директор и секретарь.

### 4.2. Задачи, сообщения, Эфир

**`tasks`** — поручение одному человеку; несколько исполнителей — копии с общим `group_id` (D-02). `parent_task_id` — у копии от «Переназначить», `passed_to` — у исходной (D-128). `source_audio_path`, `source_transcript` — фраза директора. `recurrence_rule_id` и `recurrence_on` — задача дня повтора, пара уникальна (D-148). Штампы `accepted_at`, `completed_at`, `closed_at` ставит только страж статуса. Читают автор, исполнитель, любой директор, менеджер — задачи подчинённых; `scheduled` видит только автор. Пишут только функции (§7.1).

**`task_messages`** — всё, что происходит с задачей; только дописывается. `seq` — монотонный `bigserial` на всю базу. Читают и пишут участники задачи, отправитель — только сам; `meta` правят лишь функции и триггеры. Ключи `meta`: `old_status`, `new_status`; `duration_ms` голосового (D-66); `is_question` и `answered_at` (G.7, D-03); `decline_reason` с подсказкой коллеги `suggest_assignee_id`, `rework_comment`, `report` и его `partial`; просьба о сроке `time_request`, `proposed_deadline`, `words`, закрытие — `answered_at` и `answer` (`approved`, `kept`, `changed`, `replaced`, `closed`) (D-128); служебные `deadline_changed`, `deadline_kept`, `reassigned_to`, `passed_from`, `nudge`, `handoff_note`.

**`task_reads`** — курсор прочтения: строка на человека и задачу, `last_seq` (D-61); флага «прочитано» на сообщении нет. Читает сам, двигает `mark_thread_read`.

**`task_reactions`** — реакция директора, ключ `(task_id, author_id)` (D-133). Видят автор, директор, исполнитель; пишет `react_to_task`.

**`announcements`** — объявление Эфира, создаёт `confirm_voice_batch`; **`announcement_acks`** — «прочитал». Читает компания, кроме `tv`; объявление удаляет директор, подтверждения и ждущие пуши уходят с ним.

### 4.3. Голосовой вход и журнал ИИ

**`inbox_items`** — черновик захвата (G.11): `status`, `audio_path`, `transcript`, `entities`, `recorded_at` — когда отпустили лицо (D-130); `(company_id, client_request_id)` уникален. Читают автор и директор; пишет автор до `confirmed`.

**`ai_logs`** — строка на вызов STT и разбора (G.4): модель, транскрипт, ответ, токены, времена, `status`. `confirm_voice_batch` дописывает в строку разбора того же ключа `confirmed_entities`, `was_edited`, `edit_fields` (D-35). Цену считает «Лаб» по `lib/ai/pricing.ts`. Читает директор.

**`ingest_batches`** — регистр идемпотентности: ключ и `result` первого вызова. Читает директор.

### 4.4. Доставка

**`notification_deliveries`** — outbox пушей. `meta` несёт готовые `title`, `body`, `url` и ключи производителя — воркер ничего не сочиняет. `event_kind` — вид (BACKEND §4); `deliver_after` — окно доставки данными; `sent_at`, `seen_at`, `acted_at` — квитанции «отправлено / увидел / принял» (D-32); `claimed_at` — захват воркером; `category`, `mode`, `held`, `silent`, `private`, `digest_id` — маршрут по правилам директора (§8.3). Читают адресат и директор. Ушедшие живут 30 дней, неушедшие — 7.

**`push_subscriptions`** — браузер с пушами: `endpoint` уникален, `enabled`, `last_ok_at`, `last_error`. Читают сам и директор; пишет `app/api/push/subscribe/route.ts` под service role от имени вызывающего.

**`notification_prefs`** — правила пушей директора: категории, тишина, встречи, важные люди (D-114). Умолчания — в `lib/push/prefs.ts` и `notify_prefs_defaults()`, держать одинаковыми. Читает сам директор, пишет `set_notify_prefs`.

### 4.5. Очки и магазин

**`point_transactions`** — журнал: `amount <> 0`, `reason`, `source`, `rule_code` (`quick_accept`, `on_time`, `early`, `late`, `daily_report`, `daily_report_missed`, `daily_report_missed_refund`, `refund`), `task_id`, `order_id`, `daily_report_id`, `actor_id`; `quiet` — похвала не для Эфира и стены. Уникальные ключи: авто-бонус — раз на задачу и правило (D-31), hold и release — по одному на заказ, отчёт — раз (D-152). Читают сам и директор, пишут функции и триггеры. Ручной минус может увести баланс ниже нуля (D-12), hold — нет. Строки правят только удаление задачи (обнуляет `task_id`) и чистка компании из консоли.

**`point_balances`** (view) — `balance`, `spent`, `earned_30d` на человека (D-126), читается под RLS журнала.

**`point_disputes`** — «Оспорить» минус: один спор на строку, `open`, затем `refunded` или `kept`. Видят сам и директор.

**`ether_events`** — хорошие новости Эфира (`merch`, `praise`), рождаются в триггерах при включённых очках и `settings.ether_events`. Читает компания, кроме `tv`; удаляет директор.

**`shop_items`** — витрина (`stock`: `null` — без предела); директор и завхоз пишут upsert'ом под RLS с id от клиента; товар с заказами не удаляется, а выключается. **`orders`** — заказ со снимком `price` и `stock_reserved`; читают заказчик, директор, завхоз; меняют только функции.

### 4.6. Заметки и доски

**`notes`** — приватная мысль директора (D-75), она же пункт доски (D-102). `converted_task_id`, `converted_announcement_id` — во что превратилась; `deleted_at` — корзина на 3 дня; `remind_at` — «напомни мне» (D-95). У пункта: `board_id`, дробный `position` (перестановка — одна строка), `done_at`, `parent_id` — подпункт одного уровня (D-121), `sketch` — рисунок до 256 КБ (D-141). Все операции — только автор, роль не важна; пункт — только на свою доску.

**`mind_boards`** — доска: `title`, `deleted_at`, `pinned_at`, `finished_at` (D-140); доступ — как у `notes`. **`reminders`** выведена из оборота (D-95).

### 4.7. Календарь

**`events`** — мероприятие одно на всех (D-78): `everyone` — только для показа, `reminded_at` — перенос обнуляет, `recurrence_rule_id` — встреча серии. **`event_participants`** — `(event_id, user_id)`, `status` (`invited`, `going`, `declined`); автор — всегда `going`. Директор видит весь календарь, остальные — что созвали или куда позваны, `tv` — ничего. Видимость считают `is_event_participant()` и `can_see_event()`, чтобы политики двух таблиц не ссылались друг на друга. Создают `confirm_voice_batch` и тик серии, правят функции (§7.3).

### 4.8. Секретарь

**`errands`** — просьба директора секретарю (D-79): `kind` — код кнопки из `settings.secretary.actions`, `label` — её надпись в момент просьбы, `claimed_by`, `result`, `eta_at`, `question`, `answer`, `until_at`, `urgent` — тревога (D-99), `due_at` (D-106 §8), `thanked_at` (D-97). Читают автор, директора, секретари; создаёт директор вставкой под RLS, дальше — функции.

**`visits`** — от секретаря к директору (D-96, D-116): `kind` — `visitor` (`waiting`, `wait`, `invited`, `declined`, `expired`) или `message` (`waiting`, `read`, `expired`); `tv_version`, `shown_at` — квитанция стены, `closed_at` — карточка убрана. Читают директора и секретари; пишут функции.

### 4.9. Стена

**`tv_state`** — что на стене, строка на компанию (D-76): `mode` и `expires_at` фокуса, `scene`, `guest_until`, виды заставок, круг (D-123), доска совещания `board_id` (D-102, D-140), доска недели `week_board_id` (D-144), `awake_until` (D-105). `version` поднимает каждая команда, `applied_version` и `seen_at` — квитанция киоска. Читают `tv` и директор, пишут функции.

**`tv_events`** — лента киоска: `actor_id` — о ком, `payload` (`name`, `title`, `amount`) и `payload_guest` — имя без фамилии, без названия и очков. Пишут проекции и тик напоминаний; читают `tv` и директор; хранится 30 дней.

### 4.10. Отчёт, вход, повторы, голос

**`daily_reports`** — строка на человека и день Asia/Aqtobe (D-152). `submitted` — сдал сам (пустой `summary` допустим в день с задачами, D-155 п.7); `missed` — записал утренний тик. `tasks` — снимок задач дня (`lib/daily-report/types.ts`). Читают автор и директор, пишут функции.

**`login_codes`** — одноразовый код (D-135): `code_hash` — HMAC (сам код не хранится), 15 минут, ключи повтора `issue_request_id`, `redeem_request_id`; хэш открытого кода уникален на всю базу — код сам находит человека и компанию. **`login_attempts`** — попытки для лимитов. Клиентским ролям обе закрыты целиком (§7.6). Сессии — `auth.sessions` GoTrue; помощники RLS требуют живую (§6).

**`recurrence_rules`** — правило полями (D-148): `target` (`task`, `event`), `every`, `interval_n`, `weekdays` (1 — пн), `month_day` (31 — последний день), `at_time` (срок дня или начало встречи), шаблон встречи, фраза. `next_on`, `next_run_at` и прочие служебные держит триггер; `rrule` — текст правил до D-148. Арифметика дат — в SQL и в `lib/recurrence/schedule.ts`, держать одинаковой. Читает компания, кроме `tv`; правит директор под RLS.

**`voice_kept`** — записи «в корпус», не удаляются (D-155 п.3). Читают директор и секретарь, пишет `voice_keep`.

### 4.11. Схема `ops`

Консоль `app/ops` работает вне компаний (D-157). Схема закрыта для всех API-ролей: RLS без политик и грантов. `ops.operators` — разработчики (без профиля в компании); `ops.tickets` — билеты на запись на 60 секунд; `ops.audit` — журнал без внешних ключей, правки и удаления запрещает триггер.

Доступ — функциями `public.ops_*`. Чтения и выдача билета (`ops_companies`, `ops_company_card`, `ops_audit_list`, `ops_ticket` и соседние) даны `authenticated` и первой строкой зовут `ops.assert`: действующий оператор, сессия `aal2`, TOTP не старше 12 часов, для опасного — 5 минут. Остальные `ops_*` пишут, даны только service role, гасят билет `ops.take` и пишут `ops.log`; `ops.take` ставит `pulse.ops_quiet` — служебная правка не шлёт пушей. Операторов выдаёт `pnpm ops:grant`. Новая таблица с `company_id` обязана попасть в выгрузку `ops.export_tables()` или в исключения `supabase/tests/052_ops_console.test.sql`, иначе тест падает.

## 5. `companies.settings`

Схема и умолчания — `CompanySettingsSchema` в `lib/settings.ts`: битая секция читается как умолчание, неизвестные ключи сохраняются; SQL читает свои секции с теми же ключами и умолчаниями. Пишут: `update_company_settings` (директор, секретарь; слияние поверхностное — секция приходит целиком; `dev_tools` отбрасывается), `app/api/lab/route.ts` и `app/api/company/logo/route.ts` под service role, утренний тик (`daily_report.checked_on`), консоль.

| Секция | Что | Чья | Решение |
|---|---|---|---|
| `brand` | логотип, акцент, подпись | `lib/brand.ts` | D-44 |
| `stt`, `parser` | провайдеры и модели | `lib/ai/stt.ts`, разбор | D-53, G.17 |
| `parser_rules` | «Правила компании» версиями | `lib/ai/rules.ts` | D-138 |
| `vocabulary`, `vocabulary_meta`, `word_kinds`, `dictionary` | слова компании и подсказки «Словаря» | `lib/dictionary.ts` | D-111 |
| `conventions` | что значит «до обеда» | `lib/ai/conventions.ts` | D-15 |
| `matching` | пороги матчера имён | `lib/ai/config.ts` | D-16 |
| `points_enabled`, `rating_mode` | очки, рейтинг `top5` или `full` | функции очков | D-48, D-11 |
| `points_rules` | цены авто-правил, реакций, отчёта | `points_rule()`, `reaction_points()` | D-133, D-152 |
| `ether_events` | что идёт в Эфир | триггеры Эфира | D-133 |
| `mascot_seasons`, `mascot_telegraph`, `lab_for_all` | наряды лиц, тревоги лица, «Лаб» команде | экраны | D-119, D-133, D-150 |
| `dev_tools` | «Лаборатория» и «Данные», пишет service role | экраны | D-158 |
| `delivery_window` | `from`, `to`, умолчание 08:00–21:00 | `next_delivery_slot()` | D-38 |
| `secretary` | кнопки, повтор пуша, телефон охраны | `lib/errands/` | D-79, D-99 |
| `daily_report` | дни, праздники, часы; `started_on`, `checked_on` — сервера | функции отчёта | D-152, D-155 |
| `voice_retention` | `closed_days`, `orphan_days` | `lib/voice/retention.ts` | D-155 |

## 6. RLS

**Помощники.** `auth_company_id()` и `auth_role()` (`security definer`) отвечают только работающему человеку (`is_active`) с живой сессией: `auth_session_live()` ищет `session_id` токена в `auth.sessions`, токен без него (pgTAP, скрипты) считается живым (D-135). Уволенный и отозванный теряют компанию сразу. `subordinates(mgr)` — подчинённые глубины 1. `definer` нужен, чтобы политика `profiles` не читала `profiles` подзапросом (рекурсия, 42P17). В политике помощник и `auth.uid()` пишутся `(select …)`: planner считает их раз на запрос, голый вызов идёт на каждую строку (D-126, `supabase/migrations/20260926210000_rls_initplan_fk_indexes.sql`).

`tv` читает свою строку `profiles`, `tv_state`, `tv_events`, остальное — функциями `tv_*`, которые сами маскируют гостя.

**Образец новой таблицы:**

```sql
create table things (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  user_id    uuid not null references profiles,
  created_at timestamptz not null default now()
);
create index things_company_idx on things (company_id);
alter table things enable row level security;
-- the owner and the director of the company; writes go through a definer function
create policy things_select on things for select using (
  company_id = (select auth_company_id())
  and (user_id = (select auth.uid()) or (select auth_role()) = 'director')
);
```

К ней — pgTAP «компания A не видит компанию B» со второй компанией в самом тесте, строка в выгрузке консоли (§4.11) и, если нужно, публикация Realtime (§10).

**Гранты функций.** Новая функция в `public` сразу исполняема `anon`, `authenticated` и `service_role`. Миграция пишет `revoke execute … from public, anon` для функций людей, `from public, anon, authenticated` — для внутренних и тиков, затем `grant`; в `security definer` — `set search_path = public`. Смена имён параметров или типа результата — `drop function`, `create function` и гранты заново.

## 7. Функции (RPC)

Ошибка — `raise exception '<код>' using errcode = 'P0001'` (`forbidden`, `task_not_found`, `invalid_transition` …), роут переводит код в ответ. Клиент зовёт функции именованными аргументами — имена параметров входят в контракт; параметр с именем колонки тело копирует в `v_*`. «Ключ»: «да» — принимает `client_request_id`; «нет» — абсолютная команда или исключение D-155 п.4, повтор безвреден.

### 7.1. Задачи и Эфир

| Функция | Кто | Что делает | Ключ |
|---|---|---|---|
| `confirm_voice_batch` | директор | одна запись пачки: задачи, объявления, заметки, мероприятия, повторы, очки; вне окна задачи — `scheduled`; исполнитель — активный человек своей компании; дописывает `ai_logs`, закрывает `inbox_items` | да |
| `transition_task` | по матрице §8.1 | переход и в той же транзакции причина, комментарий или отчёт; из `rework` сам проходит через `accepted` (D-130) | да |
| `revoke_task` | директор | `scheduled` удаляет, остальное отзывает (D-01) | да |
| `send_task_now` | директор | отложенная и её ждущие пуши команде уходят сейчас (D-129) | да |
| `extend_task_deadline` | директор | новый срок со словами, закрывает просьбу о сроке | да |
| `reassign_task` | директор | копия новому исполнителю, исходная отозвана с `passed_to` | да |
| `request_deadline` | исполнитель | просьба о сроке; на `sent` заодно принимает | да |
| `answer_deadline_request` | директор | «Согласовать» или «Оставить прежний» | да |
| `nudge_task` | директор | «Напомнить», раз в 30 минут | да |
| `delete_task`, `purge_closed_tasks` | директор | удаление задачи или всех закрытых (D-58) | нет |
| `mark_thread_read` | участник | курсор только вперёд, «принял» у пушей треда | нет |
| `react_to_task` | директор | реакция; очки — разницей к цене | да |
| `send_announcements_now` | директор | ждущие пуши объявлений уходят сейчас | да |

### 7.2. Очки, магазин, пуши

| Функция | Кто | Что делает | Ключ |
|---|---|---|---|
| `award_points` | директор | плюс или минус с причиной; `p_public = false` — тихо | да |
| `dispute_points` | сам | спор своего немагазинного минуса, раз | да |
| `resolve_points_dispute` | директор | вернуть строкой `refund` или оставить | да |
| `fn_rating` | все | рейтинг за период; при `top5` — пятёрка и сам, директору — все | чтение |
| `create_shop_order` | все, кроме `tv` | под advisory-lock: баланс, резерв остатка, `shop_hold` | да |
| `cancel_shop_order` | свой `pending`; директор и завхоз — до выдачи (D-37) | `shop_release`, остаток назад | да |
| `set_shop_order_status` | директор, завхоз, не свой | подтвердить или выдать; выдача транзакций не пишет | да |
| `set_notify_prefs` | директор | правила пушей, ждущая очередь перестраивается | нет |
| `push_health` | директор, секретарь | устройства и последний пуш по человеку | чтение |
| `claim_deliveries` | service role | воркер захватывает строки `mode = 'now'` с наступившим `deliver_after` | — |

### 7.3. Календарь и секретарь

| Функция | Кто | Что делает | Ключ |
|---|---|---|---|
| `respond_event` | участник | «Иду» или «Не смогу», автор узнаёт об отказе раз | нет |
| `edit_event`, `delete_event` | директор | поля и состав одной командой или удаление; знавшим — перенос или отмена | нет |
| `director_busy` | директор, секретарь | занятость директоров отрезками без названий и людей, до 31 дня (D-158) | чтение |
| `transition_errand` | секретарь, взявший, автор | автомат заявки: берёт первый, «Готово» — взявший, отмена — автор | да |
| `errand_eta`, `errand_result` | взявший | «через N мин»; результат в 30 минут после «Готово» | да |
| `errand_ask`, `errand_answer` | секретарь, затем автор | уточнение и ответ | да |
| `errand_nudge`, `thank_errand` | автор | повтор ничьей раз в минуту; «Спасибо» за `done` | да |
| `announce_visit` | секретарь | посетитель или сообщение на стену | да |
| `answer_visit` | директор | ответ; «Пусть заходит» включает гостя на час | нет |
| `close_visit` | секретарь, директор | карточка убрана | нет |

### 7.4. Стена и доски

| Функция | Кто | Что делает | Ключ |
|---|---|---|---|
| `tv_control` | директор | состояние стены целиком: режим, фокус, сцена, гость, виды, круг, доска на срок, разбудка | нет |
| `tv_board_control` | директор | подсветка пункта, вид `list` или `map`, «+30 мин» итоговым временем | нет |
| `tv_week_board` | директор | своя доска в круг до воскресенья 21:00 или снять | нет |
| `tv_heartbeat` | `tv` | квитанция киоска, визитам — «показано» | — |
| `tv_summary`, `tv_focus`, `tv_calendar`, `tv_overlay`, `tv_board`, `tv_rating` | `tv`, директор | данные сцен стены, с гостем — маска | чтение |
| `mind_board_copy` | автор доски | новая доска из неотмеченных пунктов (D-140) | да |

### 7.5. Компания, люди, голос, отчёт

| Функция | Кто | Что делает | Ключ |
|---|---|---|---|
| `update_company_settings`, `update_company_profile` | директор, секретарь | слияние секций без `dev_tools`; название | нет |
| `revoke_sessions` | сам себе; директор, секретарь — не директору | удаляет сессии, push-подписки, открытые коды; можно оставить этот телефон | нет |
| `voice_keep` | директор | запись «в корпус» или обратно | нет |
| `my_daily_report`, `my_daily_report_history` | команда | свой день и история | чтение |
| `submit_daily_report` | команда | сдача или правка за сегодня; вчерашний — пока день не закрыт; +1 за первую сдачу | да |
| `team_daily_report_day`, `team_daily_report_period` | директор | день команды, период до 92 дней | чтение |

### 7.6. Вход по коду — service role

Кто кому выдаёт, проверяет роут (`lib/people/access.ts`). `issue_login_code` отменяет прежний открытый код человека, держит до 30 открытых на компанию; `collision` — хэш занят, сервер берёт другой код. `redeem_login_code` — лимиты (10 неверных за 15 минут с адреса и с устройства, 200 за 10 минут на базу), код берётся одним `update`, тот же `p_request_id` в 10 минут снова отдаёт человека. `release_login_code` — сессия не создалась, код возвращается.

### 7.7. Тик — service role

Зовёт `app/api/push/sweep/route.ts` (порядок, расписание — BACKEND §10); `pg_cron` не подключён. Каждый шаг идемпотентен отметкой в строке или уникальным ключом.

| Функция | Что делает |
|---|---|
| `daily_reports_due_missed` | прошедший рабочий день без отчёта — `missed`, минус — только сдававшему раньше (D-155 п.1) |
| `recurrence_spawn` | задачи и встречи повторов, день — одна вещь; проспанный день не выдаётся |
| `publish_due_scheduled` | отложенные с наступившим `scheduled_send_at` уходят в `sent` |
| `events_due_reminders`, `notes_due_reminders` | «Скоро» участникам и на стену, «напомни мне» |
| `errands_due_escalation`, `errands_expire`, `errands_due_remind`, `visits_due_expiry` | повтор ничьей просьбы, конец просьбы со сроком, напоминание о сроке, истечение визита |
| `unseen_task_alerts_due`, `overdue_alerts_due`, `deadline_reminders_due` | «Задача не принята», «Просрочено», «Скоро срок» за час |
| `daily_report_reminders_due`, `team_channel_alerts_due`, `director_day_summaries_due`, `director_digests_due` | «Сдайте отчёт», «Уведомления не доходят», «Итог дня», сводки |
| `notes_purge_trash`, `notification_deliveries_purge`, `tv_events_prune` | чистка корзины, outbox, ленты стены |
| `voice_purge_due`, `voice_mark_purged` | какие файлы голоса удалить; после удаления — обнулить пути (§9) |

### 7.8. Служебные

Клиент их не зовёт: помощники RLS (`auth_session_live`, `subordinates`, `team_role`); чтение настроек (`points_rule`, `daily_report_workday`, `voice_retention_days`, `notify_prefs_of`); доставка (`next_delivery_slot`, `delivery_category`, `push_when` — слова срока как `lib/ai/time.ts`); очки (`task_sent_at`, `task_streak_of`); стена (`tv_emit`, `tv_touch`, `tv_task_story`); календарь (`event_release`, `set_event_participants`); заявки (`errand_recipients`); функции триггеров.

## 8. Триггеры

Триггеры одного события Postgres запускает по алфавиту имён: на `tasks` `trg_task_status_guard` идёт раньше `trg_tasks_field_guard`, и страж полей видит готовые штампы. Имя нового триггера решает его место.

### 8.1. Страж статуса задачи

`trg_task_status_guard` (before update of status) проверяет матрицу и ставит штампы сам.

| Из | В | Кто |
|---|---|---|
| `scheduled` | `sent` | тик или директор (D-129) |
| `sent` | `accepted` | исполнитель |
| `sent`, `accepted` | `declined` | исполнитель |
| `accepted` | `pending_review` | исполнитель |
| `pending_review` | `done`, `rework` | директор |
| `rework` | `accepted` | исполнитель |
| `declined` | `sent` | директор, «Настоять» (G.20), `closed_at` обнуляется |
| любой, кроме `done` и `revoked` | `revoked` | директор (D-01) |

«Директор» — любой профиль с этой ролью. Без пользователя (service role, тик) проходит любое ребро, роль не проверяется. `accepted_at` ставится только при принятии из `sent`, `completed_at` — на сдаче, `closed_at` — на `done`, `declined`, `revoked`. `trg_task_status_message` пишет строку `status_change`.

### 8.2. Стражи полей

- `trg_tasks_field_guard` — не директор и не автор меняет только `status`; без перехода штампы заморожены.
- `trg_profiles_guard` — не директор не меняет роль, компанию, `is_active`, руководителя, серию; секретарь на чужой строке меняет, но не директору и не в директоры; `avatar_url` — только директор и секретарь.
- `trg_recurrence_rules_schedule` — расписание повтора: от ближайшего невыданного дня, после правки — от «сейчас»; человек не меняет владельца и служебные поля.
- `trg_notes_branch_guard`, `trg_notes_branch_cascade`, `trg_notes_branch_follow` — подпункт только у живого пункта той же доски; корзина и переезд — веткой.
- `trg_point_transactions_hold_guard` — после `shop_hold` баланс не ниже нуля.

Service role проходит стражи `tasks` и `profiles` без проверок — на этом стоят тик и консоль.

### 8.3. Outbox

Строки вставляют `trg_notify_outbox_tasks`, `trg_notify_outbox_messages` (одно событие `message` всем участникам, кроме отправителя, D-64), `trg_notify_outbox_announcements`, `trg_notify_outbox_event`, `trg_notify_outbox_event_participant`, `trg_notify_outbox_errand`, `trg_notify_outbox_visit` и многие функции §7; `trg_drop_announcement_pushes` снимает пуши удалённого объявления.

`trg_notification_deliveries_deliver_after` (before insert) ставит `category` и ведёт строку. Не директору — фиксированная политика: что может ждать, ждёт окна компании; заявки, визиты, напоминания — сразу. Директору — его правила: «Не присылать» — `failed` с `muted`, «Тихо» — `silent`, «Сводкой», «Не беспокоить» и встреча — `mode = 'digest'`; `alarm` и `system` не трогаются. Сбой правила строку не ломает.

### 8.4. Стена и прочее

- `trg_tv_events_task`, `trg_tv_events_points` (только поощрение, не авто-правило, не тихое), `trg_tv_events_announcement`, `trg_tv_events_order` пишут через `tv_emit()` обе копии `payload`. Правка пункта трогает доску (`trg_notes_mind_board`), версию `tv_state` поднимают `trg_mind_boards_touch_tv`, `trg_tasks_board_touch_tv` и функции визитов; `trg_tv_state_board_point` гасит подсветку при смене доски или сцены.
- `trg_tasks_points` — авто-очки (`quick_accept`, `early` — в первой половине срока, `on_time`, выключенный `late`) и серия; только при `points_enabled`, «команде», не за свою задачу.
- `trg_ether_events_praise`, `trg_ether_events_merch` — строки Эфира.
- `trg_question_answered` — первое сообщение автора закрывает открытые вопросы; `trg_close_time_requests` — задача ушла из рук, просьба о сроке закрыта.
- `trg_profiles_deactivated` — увольнение любым путём удаляет сессии, push-подписки, открытые коды.
- `trg_events_reset_reminder`, `trg_notes_reset_reminder` — перенос времени обнуляет отметку напоминания.

## 9. Storage

| Бакет | Доступ | Путь | Защита |
|---|---|---|---|
| `voice` | закрытый | `{company_id}/{user_id}/{uuid}.{ext}` | клиент пишет и читает только свою папку своей компании; правки и удаления нет |
| `photos` | закрытый, 10 МБ, изображения | так же | как `voice`; ссылку загрузки выдаёт сервер |
| `brand` | публичный, 2 МБ | `{company_id}/logo-{stamp}.{ext}` | читают все, пишет сервер (G.20d) |
| `avatars` | публичный по прямой ссылке, 1 МБ | `{company_id}/{file}` | политики чтения нет — не листается; кладут директор и секретарь в папку своей компании (D-158) |

Чужой файл открывается только подписанной ссылкой, которую выдал сервер после проверки прав (D-18). Клиент грузит прямо в Storage по подписанной ссылке — запись цела до вызовов ИИ (принцип 5).

**Срок голоса (D-155 п.3).** Файл живёт `closed_days` (90) после закрытия всех строк, которые на него ссылаются; запись без дела (только `inbox_items`) — `orphan_days` (30). Задача закрыта в `done` и `revoked` (не в `declined`), заметка — никогда, пока жива; `voice_kept` не трогается. Тик удаляет файлы через Storage API (SQL-ом из `storage.objects` не удаляют) и обнуляет пути `voice_mark_purged`; тексты остаются навсегда.

## 10. Realtime

В публикации `supabase_realtime`: `tasks`, `task_messages`, `task_reactions`, `announcements`, `announcement_acks`, `ether_events`, `point_transactions`, `point_disputes`, `notification_deliveries`, `shop_items`, `orders`, `notes`, `mind_boards`, `events`, `event_participants`, `errands`, `visits`, `profiles`, `recurrence_rules`, `daily_reports`, `tv_state`, `tv_events`. События идут под RLS подписчика. Таблица добавляется блоком «если ещё не в публикации» — миграции переигрываются с нуля на каждом инстансе.

## 11. Миграции, сид, тесты

**Миграции.** Новый файл на фичу, политики — в нём же; старые не правятся, откат — новой миграцией. Пересоздание функции несёт тело целиком, заголовок говорит, от какой версии и что изменено. Применяются по имени файла. На dev — `pnpm db:push`, затем `pnpm db:types`; `db push` в прод запрещён. После новой миграции — `pnpm db:index`: он пересобирает `supabase/SCHEMA.md` из файлов, без базы; тест `tests/schema-index.test.ts` падает, если указатель отстал. Миграции не сжимаются до создания рабочей базы (D-162).

**Сид** (только dev). Компания «Demo Group», девять профилей (директор, менеджер, завхоз, киоск `tv`, четыре сотрудника, тестовый директор). Фикстуры тестов: два «Ерлана» с общими алиасами, подчинённый менеджера, сотрудница в отпуске, задачи во всех статусах, файл в чужой папке `voice`. Токен-колонки `auth.users` — пустые строки: с `null` GoTrue отвечает 500. pgTAP ставит сид, чтобы фреймворк не уехал в прод. Реальную компанию заводит `pnpm seed:client` (SETUP §5).

**pgTAP.** Файл на фичу, номер — порядок появления: RLS ядра и стражи (001–005, 014, 026, 053, 055), функции задач (007, 008, 011, 013, 017, 037, 038, 040, 049), конвейер (006, 018, 043 про минус голосом, 047), сообщения и доставка (010, 012, 015, 016, 029–032, 036), очки (009, 039, 041), календарь, заявки и визиты (020–024, 028, 054), стена и доски (019, 022, 024, 025, 027, 033–035, 044–046), отчёт (048, 050), вход (042, 043), голос (051), консоль (052). Вторую компанию создают сами 015, 042 и 044–055. Функции магазина тестов не имеют. 052 сверяет гранты функций консоли со своим списком.

## 12. Не построено

- Telegram-ярус и эскалация, SMS: `telegram`, `sms`, `tier`, `profiles.telegram_chat_id` без производителя (D-21, D-32, D-41).
- Вопросы к данным: `ai_logs.kind = 'query'` и `tool_calls` не пишутся (G.4).
- Таблица согласий и анонимизация на стене (G.12).
- Фото награды: `shop_items.photo_path` есть, загрузки нет (D-71).
- Прод-проект и автоматическое применение миграций (D-19).

## 13. Известные ограничения

- Часовой пояс зашит в SQL литералом Asia/Aqtobe, а не задан компанией.
- Окно доставки не знает выходных и праздников.
- Сид держит одну компанию: файлы без своей второй компании проверяют роли только внутри неё.
- Без срока хранения: `ai_logs` (с транскриптами), `ingest_batches`, строки `inbox_items`, `task_messages`.
- На стенде тик раз в сутки (08:00 Актобе): отложенное, напоминания и повторы ждут утра.
- `lib/supabase/types.ts` генерируется руками и может отставать; правы миграции.
- При нескольких директорах `scheduled`-задачу видит только автор, `director_busy` сливает всех в один календарь.
- `replica identity` нигде не менялась: событие удаления в Realtime несёт только ключ, фильтр подписки его не видит.
