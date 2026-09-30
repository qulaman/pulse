# DATABASE.md — схема данных Pulse (Supabase / Postgres)

Что это: контракт схемы БД Pulse (таблицы, RLS, функции, триггеры, индексы, расписание) — для агентов, пишущих миграции. **Единственный источник правды по схеме — миграции в `/supabase/migrations`; этот документ описывает, что в них есть, и служит контрактом для новых. Арбитр — `DECISIONS.md`, читать с раздела «Сейчас действует».** При расхождении: DECISIONS.md > этот файл > остальные доки.

Метки: `[есть]`, `[за флагом: settings.<ключ>]`, `[не построено]`. Раздел без метки описывает то, что есть в миграциях.

Модель SaaS — V-02: одна БД = один клиент, изолированный инстанс (свой Supabase-проект) на каждую компанию клиента. `company_id` и RLS при этом СОХРАНЯЮТСЯ во всех таблицах — как защита ролей внутри компании и страховка архитектуры. Кросс-клиентской логики нет; всё клиентское — в `company.settings`.

## Общие правила

- Везде `id uuid primary key default gen_random_uuid()`, `company_id uuid not null references companies`, `created_at timestamptz not null default now()` — ниже не повторяются; исключения оговорены у таблиц (`task_reads`, `announcement_acks`, `event_participants`, `tv_state`, `recurrence_rules`).
- Все времена — `timestamptz` (UTC); отображение — Asia/Aqtobe (UTC+5).
- Enum через `create type`. RLS — в той же миграции, где создаётся таблица; deny by default.
- В политиках `auth_company_id()`, `auth_role()`, `auth.uid()` — только обёрнутыми: `(select auth_company_id())`. Голый вызов выполняется на каждую строку (и сам — чтение `profiles`), обёрнутый — один раз на запрос и годится в условие индекса; старые политики переписаны миграцией `20260926210000_rls_initplan_fk_indexes` (D-126: чтение директора на 20 000 задач 72 → 8 мс). Внешний ключ, по которому удаляют родителя, — с индексом (там же пять таких индексов).
- Баланс очков = `SUM(point_transactions.amount)`, никогда не поле. Append-only.
- Просрочка — **вычислимое свойство**, НЕ колонка: `deadline < now() and status in ('sent','accepted','in_progress','rework')`. Колонку `is_overdue` не добавлять.
- Materialized views **не используем**; допустимы только обычные view `with (security_invoker = on)`. Сейчас view в БД нет ни одного: Пульс читает задачи одним запросом с вложенными сообщениями (D-57 §3).
- Партиционирование **не нужно**; порог пересмотра — 10 млн строк в task_messages. `company_id` — первым столбцом составных индексов.
- `point_balance_checkpoints (user_id, as_of, balance)` — зарезервировано, не строить.
- Миграция, добавляющая таблицу в Realtime, делает это с guard'ом «если ещё не в публикации» — миграции переигрываются на всём флоте. В публикации `supabase_realtime`: `tasks`, `task_messages`, `announcements`, `announcement_acks`, `point_transactions`, `notification_deliveries`, `shop_items`, `orders`, `tv_events`, `tv_state`, `notes`, `mind_boards`, `events`, `event_participants`, `errands`, `profiles` (клиент слушает только строки секретарей, `role=eq.secretary` — «на месте / не на месте до …» без перезагрузки, D-99; миграция `20260923235500`).

## Enum-типы

```sql
create type user_role      as enum ('director','manager','employee','shopkeeper','tv');
alter type  user_role      add value 'secretary';  -- отдельной миграцией 20260922120000 (D-79)
create type availability_t as enum ('active','vacation','sick');
create type task_status    as enum ('scheduled','sent','accepted','in_progress','pending_review','done','rework','declined','revoked');
create type task_priority  as enum ('low','normal','high');
create type message_type   as enum ('text','voice','photo','status_change','system');
create type point_source   as enum ('manual','auto_rule','reaction','shop_hold','shop_release'); -- shop_final НЕ создавать
create type order_status   as enum ('pending','approved','delivered','cancelled');
create type delivery_channel as enum ('push','telegram','sms');
create type delivery_status  as enum ('queued','sent','failed');
create type ai_log_kind    as enum ('stt','parse','query');
create type ai_source      as enum ('voice','typed','shared');
create type absence_kind   as enum ('vacation','sick','other');   -- таблицы absences нет, тип не используется
create type inbox_status   as enum ('recorded','transcribed','parsed','confirmed','discarded');
create type errand_status  as enum ('sent','accepted','done','declined','cancelled');  -- D-79
```

Статусная машина задач: `scheduled → sent → accepted → pending_review → done | rework(→accepted) | declined(→sent, «Настоять», G.20) | revoked`. `revoked` — из любого статуса, кроме `done`/`revoked` (в т.ч. `declined` — «Отменить»), только директор. `in_progress` в enum есть, переходов в него нет (D-04). `scheduled → sent` guard пускает только service role (`auth.uid() is null`); исполнителя нет — `[не построено]`, наряд 017. Матрицу проверяет триггер `trg_task_status_guard`; переходы идут только через RPC `transition_task` (плюс `revoke_task`, `reassign_task`, `request_deadline`). «Не могу» с доработки (D-128) — `transition_task` проходит собственными рёбрами стража `rework → accepted → declined` в одной транзакции; сам страж этого ребра не знает. Политика `tasks_update` (update в границах видимости select) осталась с первой миграции — клиент ею статус не меняет; поля не-автора защищает `trg_tasks_field_guard`.

## Таблицы

### companies
`id, name text, settings jsonb not null default '{}'`, created_at. Секции `settings` — `CompanySettingsSchema` в `lib/settings.ts` (код подставляет дефолты, неизвестные ключи сохраняет):

| Секция | Содержимое | Решение |
|---|---|---|
| `brand` | `logo_url`, `accent` (применяется при контрасте ≥ 4.5:1), `tagline` | D-44, G.20d |
| `stt` | `provider`, `fallback` (`openai \| whisper1 \| deepgram \| elevenlabs`), `language` (`auto \| ru`) | D-53 |
| `parser` | `model`, `escalation_model`, `escalate` | G.17 |
| `vocabulary` | контрагенты и объекты — подсказка STT | D-55 |
| `vocabulary_meta` | по `entryKey` слова — `{kind: id типа из word_kinds \| null, added_at, added_by}`; только для экрана, в подсказку не идёт; битое поле читается как null | D-111 |
| `word_kinds` | типы слов компании по порядку — `[{id, label}]`, до 12; по умолчанию Контрагент / Объект / Товар / Термин (`counterparty`, `site`, `product`, `term`); битый список читается как умолчание | D-111 §19 |
| `conventions` | что значит «до обеда» здесь; уходит в промпт | D-15 |
| `matching` | пороги матчера имён (переопределения) | D-16 |
| `points_enabled` | очки и рейтинг, дефолт `false` | D-48 |
| `rating_mode` | `top5 \| full`, дефолт `top5` | D-11 |
| `delivery_window` | `{from, to}`, дефолт 08:00–21:00 Asia/Aqtobe | D-38 |
| `secretary` | `escalate_after_min` (дефолт 3), `actions[]` — `{code, label, icon, synonyms}` | D-79 |
| `dictionary` | `dismissed[]` — уроки «Из ваших записей», спрятанные «×» (`personId:форма`, до 200, пишет `/api/dictionary/misheard`); `dismissed_words[]` — спрятанные предложения «Часто встречается» (ключи основ, до 200, пишет `/api/dictionary/words`) | D-111 |

Пишет только RPC `update_company_settings` (директор или секретарь — D-104; слияние по секциям) и `/api/lab` (секции `stt`, `parser`, service role, D-63). Правил авто-очков, карты реакций и таймаута Telegram в настройках нет `[не построено]`.

### profiles (расширение auth.users; id = fk auth.users on delete cascade, без default)
```
id uuid pk references auth.users, company_id, full_name text, role user_role,
position text null, avatar_url text null,
aliases text[] not null default '{}',        -- «Ерлан», «Ерлан Б.» для матчинга
manager_id uuid null references profiles,     -- делегирование, глубина 1
telegram_chat_id bigint null,                 -- колонка есть, привязки нет (D-21)
is_active bool not null default true,         -- оффбординг: false = вне рейтинга/матчинга/рассылок
availability availability_t not null default 'active',
settings jsonb not null default '{}',         -- ключей код не читает
streak_count int not null default 0, streak_updated_at timestamptz null,  -- streak не считается [не построено]
created_at
```
Роль `tv` — служебный auth-пользователь киоска; `secretary` — сотрудник с правом вести заявки (D-79), а с D-104 — ещё настройки и команду: карточки, роли и вход всех, кроме директоров. Кто «команда» — функция `team_role(role)`: `employee`, `manager`, `shopkeeper`, `secretary`. Аватаров нет (бакета `avatars` нет).

### tasks
```
id, company_id, author_id, assignee_id not null, parent_task_id uuid null → tasks,
group_id uuid null,                    -- мульти-исполнитель: N задач-копий с общим group_id (D-02)
title text not null, body text null, deadline timestamptz null, priority task_priority default 'normal',
status task_status not null default 'sent',
source ai_source null, source_audio_path text null, source_transcript text null,
scheduled_send_at timestamptz null,    -- только при status='scheduled'
recurrence_rule_id uuid null → recurrence_rules,
passed_to uuid null → profiles,       -- D-128: кому передана; ставит reassign_task на закрываемой копии
accepted_at, completed_at, closed_at timestamptz null,   -- ставит только trg_task_status_guard
created_at, updated_at timestamptz not null default now()   -- moddatetime
```
Правило: **все** выборки лент, пушей, Пульса, ТВ фильтруют `status <> 'scheduled'` (или RLS-условие ниже). Push уходит только на переходе в `sent`. Дедлайн без значения = null («без дедлайна», парсер не выдумывает). `accepted_at` — первое принятие (переживает `rework → accepted`).

### task_messages — ядро событийной модели
```
id, company_id, task_id → tasks on delete cascade, sender_id,
seq bigserial,                         -- монотонный курсор: клиент догоняет where seq > :last_seq
type message_type, content text null, file_path text null,
meta jsonb not null default '{}', created_at
```
Всё происходящее с задачей — строка здесь; Пульс/лента/ТВ читают отсюда. `meta`:
- `status_change` → `{old_status, new_status}` (триггер);
- голосовое → `{duration_ms}` (длина записи с телефона отправителя, потолок 10 000 — плеер рисует волну и считает секунды, не скачав файла, D-66);
- вопрос сотрудника → `is_question: true`; `answered_at` проставляет триггер при **первом** последующем сообщении автора задачи (стопка «Вопросы» = `is_question` без `answered_at`, задача не терминальна);
- `decline_reason: true` — причина «Не могу», `rework_comment: true` — комментарий доработки, `report: true` — отчёт при сдаче (текст или фото; пишет `transition_task`, D-64 §3);
- системные строки RPC: `deadline_changed` + `old_deadline`/`new_deadline`/`stricter` («Срок»; у согласованной просьбы ещё `request_id`), `deadline_kept` + `request_id` («Оставить прежний»), `reassigned_to` + `assignee_id` («Переназначить», на старой задаче), `passed_from` + `from_assignee_id` («Передана от …», на новой), `nudge: true` («Директор напомнил» — не закрывает вопрос);
- D-128, предложения сотрудника — сообщения с флагом, статусов не прибавляют: `time_request: true` + `proposed_deadline`, `old_deadline`, `words` («Прошу срок до 27.09 10:00 · …»; `answered_at` + `answer` ∈ `approved | kept | changed | replaced | closed` проставляют RPC и триггер `trg_close_time_requests`; открыта — без `answered_at`); у причины отказа `suggest_assignee_id` + `suggest_name` («Это к другому»); у отчёта `partial: true` («Сделано не всё»); `handoff_note: true` — слово директора новому исполнителю при передаче.

Реакций нет `[не построено]`. Таблицы `task_events`/`feed_items` **не вводить** — task_messages+seq и tv_events закрывают ленты (DECISIONS.md, раздел G).

### task_reads — курсор прочтения треда (D-61)
`task_id fk tasks (cascade), user_id fk profiles (cascade), company_id fk companies, last_seq bigint not null default 0, seen_at timestamptz not null default now()`, PK (task_id, user_id), без `id`/`created_at`. Одна строка на человека и задачу: сообщения треда с `seq > last_seq` для него непрочитаны. Читает только сам человек (RLS `user_id = auth.uid()`); пишет **только RPC `mark_thread_read(task_id, seq)`** (security definer, `greatest(old, new)` — курсор монотонный, оффлайн-повтор старого «Прочитал» его не откатывает; та же транзакция ставит `acted_at` квитанциям `message` треда, D-64). Прямые insert/update-политики «своё» остались как страховка, клиент ими не пользуется. Двигают курсор: открытие треда (страница и шторка), «Прочитал» на карточке и в шторке уведомления (`/api/push/acted`), собственный ответ. «Сообщения» Пульса и Ленты = задачи, где последнее настоящее сообщение (text/voice/photo, не status_change/system) — **не моё и выше моего курсора** (читающий любой: директор, менеджер, сотрудник), плюс открытые вопросы (`is_question` без `answered_at`). Флаг «прочитано» на самом сообщении не вводить: сообщения общие и append-only, курсор — личный.

### announcements (Эфир)
`id, company_id, author_id, audio_path text null, transcript text not null, created_at`. Удаляет директор — жёстко, подтверждения уходят каскадом.
### announcement_acks
`announcement_id → announcements on delete cascade, user_id, created_at`, PK (announcement_id, user_id), без `company_id`.

### point_transactions — append-only
```
id, company_id, user_id, amount int check (amount <> 0),
reason text not null check (length(trim(reason)) > 0),
source point_source not null, rule_code text null,
task_id uuid null → tasks, order_id uuid null, actor_id uuid null → profiles, created_at
```
Insert-политик нет: строки пишут только security-definer-функции — `award_points` (ручные ± директора, `source='manual'`), `confirm_voice_batch` (очки голосом: только плюс и только при `points_enabled`), магазинные RPC (`shop_hold` / `shop_release`). Авто-правил и реакций нет `[не построено]`, но ключ заложен: `unique (task_id, rule_code) where source='auto_rule'` — бонус только за **первый** done (D-31). Заморозка магазина — **hold-final** (D-10): заказ → `shop_hold`(−price); отмена → `shop_release`(+price, ровно сумма hold по order_id); выдача → новых транзакций НЕТ, hold финален. Максимум один hold и один release на заказ: `unique (order_id, source) where order_id is not null`. Страховка — `trg_point_transactions_hold_guard`: после `shop_hold` баланс ≥ 0; ручной минус директора уводить баланс в минус вправе (D-12).

**View `point_balances`** (D-126) — баланс считает база, телефон ленту не суммирует: `company_id, user_id, balance` (= SUM(amount)), `spent` (холды минус возвраты), `earned_30d` (поощрения за 30 дней без магазина). `security_invoker` — читается под RLS `point_transactions`: человек видит свою строку, директор — все, anon — доступа нет. Хранимого поля по-прежнему нет. pgTAP — `039_point_balances`.

### shop_items / orders
```
shop_items: id, company_id, title not null, description null, icon null, photo_path null,
            price int check (price > 0),
            stock int null check (stock >= 0),   -- null = без ограничения, 0 = закончился
            is_active bool default true, sort int default 100, created_at, updated_at
orders: id, company_id, user_id, item_id references shop_items on delete restrict,
        price int not null check (price > 0),   -- снапшот цены на момент заказа
        status order_status default 'pending',
        stock_reserved bool not null default false,   -- остаток резервировался: отмена вернёт единицу только такому
        created_at, approved_at null, delivered_at null, updated_at
```
`icon` — эмодзи награды (D-71 §10–12); `photo_path` в схеме есть, загрузки фото нет. `description` — одна строка «что человек получает». Стартовая витрина (D-71) вставлена миграцией `20260917160000` компаниям без товаров на момент миграции; состав и цены правятся как данные.
Ассортимент правят директор и завхоз прямо из приложения: запись в `shop_items` идёт **не через RPC, а обычным upsert под RLS** — id выдаётся клиентом заранее, поэтому повтор запроса не создаёт второй товар. Товар с заказами не удаляется — `is_active=false`. Отмена pending — сам сотрудник, director, shopkeeper; после approved — только director/shopkeeper (D-37). Мутации заказов — только через RPC ниже.

### push_subscriptions
`id, company_id, user_id → profiles on delete cascade, endpoint text unique, p256dh text, auth text, user_agent text null, created_at`; с D-114 ещё `label text` («iPhone · Safari», `lib/push/device.ts`), `enabled boolean default true` (директорское «присылать сюда»), `last_ok_at`, `last_error`, `last_error_at`, `updated_at` — как прошёл последний пуш на это устройство (пишет воркер). Ответ push-сервиса `404`/`410` — подписка удаляется воркером; браузер регистрирует себя заново при каждом открытии приложения и в `pushsubscriptionchange`. Запись — `/api/push/subscribe` (service role, строго от имени вызывающего: адрес принадлежит браузеру — вошёл другой человек, подписка переходит к нему).

### notification_prefs — правила пушей директора (D-114)
`user_id pk → profiles on delete cascade, company_id, prefs jsonb default '{}', updated_at`. Строка только у директора: RLS — select своей строки при `auth_role()='director'`, политик на запись нет; пишет RPC `set_notify_prefs`, сотруднику — `forbidden`. Форма `prefs` и дефолты — `lib/push/prefs.ts` и `notify_prefs_defaults()` (держать одинаковыми): `modes` по девяти категориям (`now | quiet | digest | off`), `unseen_after_min`, `digest_every` (`30min | hour | twice`), `day_summary_at`, `quiet {on, from, to, weekends}`, `pass {reminders, visitors, vip}`, `meetings`, `vip uuid[]`, `lock_text (full | short)`.

### notification_deliveries — outbox доставки
```
id, company_id, user_id → profiles on delete cascade, task_id uuid null → tasks on delete cascade,
event_kind text not null,
channel delivery_channel not null default 'push', status delivery_status not null default 'queued',
tier int not null default 1, attempts int not null default 0, last_error text null,
meta jsonb not null default '{}',      -- title / body / url / tag … рендерит производитель; воркер ничего не сочиняет
deliver_after timestamptz not null default now(),   -- окно доставки как данные (D-51)
created_at, sent_at, seen_at, acted_at timestamptz null,
claimed_at timestamptz null,           -- воркер взял строку (claim_deliveries, D-114); старше 2 мин — снова в очереди
category text null,                    -- категория для правил директора: review / declined / questions / messages /
                                       -- unseen / overdue / team / secretary / calendar / shop / reminders / alarm / system / tasks
mode text not null default 'now',      -- now | digest (ждёт сводки, воркер не берёт)
held text null,                        -- почему ждёт: quiet / meeting / schedule
silent boolean default false, private boolean default false,   -- «Тихо» и «текст на блокировке» директора
digest_id uuid null → notification_deliveries   -- строка ушла внутри этой сводки
```
Триггеры и RPC **вставляют строку**, не зовут HTTP; отправляет воркер `lib/push/send.ts` (BACKEND §4). Виды `event_kind` (матрица — BACKEND §4): директору (автору задачи) — `pending_review`, `declined`, `message` (просьба о сроке — тоже `message`, с `meta.time_request` и `is_question`: категория «Вопросы», в переписку не складывается); исполнителю — `task_sent`, `rework`, `done`, `revoked` (у переданной — заголовок «Задача передана · …»), `deadline_extended`, `deadline_moved` (срок раньше или впервые), `deadline_kept` («Срок прежний»), `task_nudge` («Напомнить»), `deadline_soon` («Скоро срок»), `message` (D-128); всем активным, кроме `tv` и автора, — `announcement`; магазин — `shop_order`, `shop_approved`, `shop_ready`, `shop_cancelled`; календарь — `event_invite`, `event_moved`, `event_cancelled`, `event_reminder`, `event_declined`; заявки — `errand_sent`, `errand_accepted`, `errand_done`, `errand_declined` (адрес карточки — `meta.errand_id`, `task_id` пуст). Строки прежних видов `question`/`reply` могут остаться, новых нет.
**Маршрут строки** — триггер `trg_notification_deliveries_deliver_after` (before insert; тело с D-114 — `20260924150200_notify_prefs.sql`) ставит `category` каждой строке и дальше делит по получателю. **Не директор** (сотрудник, секретарь, завхоз — фиксированная политика): `deliver_after = next_delivery_slot(company, now())` для `reply, rework, done, revoked, deadline_extended, announcement, shop_order, shop_approved, shop_ready, shop_cancelled, event_invite, event_moved, event_cancelled`, а также для `message` человеку, который не автор задачи; остальные виды (все `errand_*`, `visit_*`, `event_reminder`, `event_declined`, `note_reminder`, `test`) уходят сразу; `task_sent` при «Настоять» (`declined → sent`) производитель сам кладёт на открытие окна. **Директор**: категории `alarm` и `system` не трогаются; «Не присылать» → `failed` + `last_error='muted'`; «Тихо» → `silent`; «текст на блокировке» → `private`; «Не беспокоить» → `mode='digest'`, `held='quiet'`, `deliver_after` = конец тишины (пробивают свои напоминания, посетитель, важные люди — по флагам `pass`); встреча из календаря при `meetings` → `held='meeting'` до её конца (проходят «скоро», посетитель, важные люди); «Сводкой» → `held='schedule'` до слота сводки; важные люди (исполнитель задачи в `vip`) поднимают «Тихо»/«Сводкой» до «Сразу». Сбой правила строку не ломает — уходит как раньше. Воркер берёт только `mode='now'` и `deliver_after <= now()` (`claim_deliveries`), индекс `notification_deliveries_due_idx`; сводки — `notification_deliveries_digest_idx`.
**Самоочистка** (D-114 §10): ушедшие и неудавшиеся строки живут 30 дней, не ушедшие (`queued`) — 7; `notification_deliveries_purge()` из минутного тика удаляет до 2000 самых старых за раз, индекс `notification_deliveries_created_idx`. `channel` сейчас всегда `push`, `tier` — всегда 1; Telegram-ярус и эскалация по таймауту `[не построено]` (D-21, D-32); `sms` в enum есть, в v1 не отправляется (D-41). Индикатор директора = «не открывал с HH:MM» (нет seen_at), не «не получил».

### ingest_batches — идемпотентность мутаций
`id, company_id, user_id, client_request_id uuid not null, result jsonb not null default '{}', created_at`, constraint `ingest_batches_company_request_key unique (company_id, client_request_id)`. При дубле RPC возвращает сохранённый result (те же id сущностей). `client_request_id` обязателен на мутирующих вызовах; исключения — BACKEND §0.

### ai_logs
```
id, company_id, user_id, kind ai_log_kind, source ai_source null,
provider text not null, model text not null,
transcript text null, raw_response jsonb null,
parsed_entities jsonb null, confirmed_entities jsonb null,
was_edited bool null, edit_fields text[] null,      -- метрика «доля правок» (D-35)
tool_calls jsonb null,                              -- для вопросов к данным; не заполняется
input_tokens int null, output_tokens int null, cache_read_tokens int null,
stt_ms int null, parse_ms int null, latency_ms int null,
status text not null,                                -- 'ok' | 'error:<код>'
client_request_id uuid null, request_id text null, created_at
```
`confirm_voice_batch` дописывает confirmed_entities / was_edited / edit_fields в строку разбора того же client_request_id. Колонки стоимости нет — цену считает «Лаб» по `lib/ai/pricing.ts` (D-63).

### tv_events — лента киоска
```
id, company_id, kind text not null check (kind in ('task_sent','task_accepted','task_review','task_done',
                                                  'points','announcement','merch','event')),
actor_id uuid null → profiles,      -- о ком событие: сотрудник, а не автор поручения
task_id uuid null → tasks on delete cascade,
payload jsonb not null default '{}', payload_guest jsonb not null default '{}', created_at
```
Строки рождаются только в security-definer-проекциях через `tv_emit(...)`: триггер на `tasks` (вставка `sent` и переходы в `sent`/`accepted`/`pending_review`/`done`), на `point_transactions` (только поощрение: сумма > 0 и не магазин), на `announcements`, на `orders` (выдача → `merch`); вид `event` пишет `events_due_reminders`. Отказ, доработка, отзыв и просрочка не проецируются вообще (D-45). **Маскирование — при записи**: `payload = {name, title, amount}`, `payload_guest` — имя без фамилии, `title` пуст (кроме названия награды), `amount` пуст (D-33). Хвост чистит `tv_events_prune(p_days default 30)` — вызова нет `[не построено]`.

### tv_state — пульт ТВ (D-76)
```
company_id uuid pk → companies,   -- одна строка на компанию, без id/created_at
mode text not null default 'ether' check (mode in ('ether','employee','task')),
employee_id uuid null → profiles on delete set null, task_id uuid null → tasks on delete set null,
scene text not null default 'face' check (scene in ('face','clock','team','calendar','board')),   -- calendar — D-96, board — D-102
guest bool not null default false,
guest_until timestamptz null,     -- гость, включённый визитом, гаснет по часам киоска (D-96)
clock_style text not null default 'digital' check (clock_style in ('digital','analog')),   -- D-96
calendar_view text not null default 'week' check (calendar_view in ('week','month')),   -- «Сегодня» с неделей или месяц, D-98
board_id uuid null → mind_boards on delete set null,   -- доска на стене при scene = 'board', D-102
board_until timestamptz null,     -- доска уходит со стены: 21:00 Актобе, поставленная после 21:00 — через 2 часа
board_guest bool not null default false,   -- «Показать гостю»; сбрасывают новая доска и выключенный гость
board_point uuid null → notes on delete set null,   -- обсуждаемый пункт доски на стене (ведущий), D-121
board_view text not null default 'list' check (board_view in ('list','map')),   -- доска на стене: список или карта, D-121
awake_until timestamptz null,     -- разбудка с пульта: ночь не гасит стену до этой отметки, D-105
expires_at timestamptz null,      -- фокус гаснет по часам киоска, без cron
version int not null default 0,   -- поднимает каждый tv_control; киоск квитирует
reload_requested_at, seen_at timestamptz null, applied_version int null,
updated_by uuid null → profiles, updated_at   -- moddatetime
```
Пишут только RPC `tv_control` (director, абсолютное состояние, без `client_request_id`, D-76 §3) и `tv_heartbeat` (tv); данные фокуса — `tv_focus()` (tv/director; маска гостя и отсев негатива внутри).

**Стена v2 (D-96, миграция `20260923230000_tv_wall_v2`):** `tv_control(..., p_clock)` пересоздан; `tv_focus()` отдаёт ещё `counts {new, work, review}` по всем открытым делам, `done_today`, `points_week`, `employee.avatar_url` (гостю — null); `tv_calendar(p_guest, p_days)` — неделя мероприятий для роли `tv`, которая `events` не читает; `tv_overlay()` — надпись поверх сцены. pgTAP — `022_tv_wall_v2.test.sql`.

**Карточки с хронологией (D-120, миграция `20260925120000_tv_focus_story`):** `tv_focus()` v3 — до 12 открытых дел с `source` и `story` (события `posted | seen | accepted | question | text | photo | voice | director | deadline | review | again | done` со временем, без слов; отказ, «Настоять», отзыв и комментарий к доработке не отдаются — D-45), `done_recent` (до 6 сданных за 7 суток с историей), `rating {points, rank (только ≤ 5), weeks[4], done_week, on_time_week}` — гостю `null`; `points_week` считается без фильтра `fn_rating` по смотрящему. Историю одного дела собирает `tv_task_story(uuid)` (не security definer, execute у ролей API отозван, зовётся только из `tv_focus`). pgTAP — `033_tv_focus_story.test.sql`.

**Стена v4 (D-123, миграция `20260925180000_tv_wall_v4`):** `tv_state.rating_view` (`week | month`) — период заставки «Рейтинг», `tv_state.carousel` — заставки по кругу (киоск считает сцену по часам), сцена `rating` в проверке; `tv_control(..., p_rating, p_carousel)` пересоздан: любая заставка или доска руками выключает круг, включённый круг снимает доску; режим `task` принимает только живое или принятое дело (`bad_task` для отказа, отзыва, отложенной). `tv_rating(p_guest, p_period)` — первая пятёрка периода (арифметика `fn_rating` без фильтра по смотрящему), рост, три последние награды (только `manual | reaction | auto_rule`, `amount > 0`), итог команды; гостю — `{hidden: true}`, без очков — `{enabled: false}`. `tv_focus()` v4 — ветка `task`: исполнитель, дело с `body` (гостю — null), `story`, `counts {photos, voices, texts, questions}`; дело стало отказом или отозвано — `{mode: 'ether'}`. pgTAP — `035_tv_wall_v4.test.sql`.

**Месяц на стене (D-98, миграция `20260923233000_tv_calendar_month`):** `calendar_view` (`week | month`) — вид заставки «Календарь»; `tv_control(..., p_calendar)` пересоздан; `tv_calendar(p_guest, p_days, p_from)` отдаёт до 42 дней с `p_from` (по умолчанию сегодня по Актобе) — сетка месяца с понедельника первой недели. pgTAP — `024_tv_calendar_month.test.sql`.

**Доска на стене (D-102, миграция `20260924090000_mind_boards`):** сцену `board` ставит только `tv_control(..., p_board)` — автор своей живой доски (`p_scene => 'board'` отклоняется, `bad_scene`; чужая или удалённая — `bad_board`); любая другая `p_scene` снимает доску; `p_board_guest` — «Показать гостю». `tv_board(p_guest)` (tv/director) отдаёт `{board, hidden}`: доску, стоящую на стене и живую по `board_until`, с пунктами по `position` (непустые, не удалённые) и нейтральными пометками (`assignee` — имя без фамилии исполнителя поручения, кроме `revoked`; `handed_done`); при госте без `board_guest` — `hidden: true`, если доску показали гостю — без имён. Правка доски на стене поднимает версию строки (`tv_touch`) — киоск перечитывает `tv_board`. pgTAP — `025_mind_boards.test.sql`.

**Доска v2 (D-121, миграция `20260925150000_mind_board_v2`):** `tv_board_control(p_point, p_clear_point, p_view)` (director) — ведущий с пульта: подсветить живой пункт верхнего уровня с текстом той доски, что сейчас на стене, может только её автор (`bad_point`); снять подсветку; вид `list | map` (`bad_view`) — настройка стены, переживает смену доски; строки стены ещё нет — `no_wall`. Поднимает версию. Новая доска и любая другая сцена гасят подсветку (`trg_tv_state_board_point`, before update). `tv_board(p_guest)` v2 отдаёт пункты веткой: `items[].children[]` (живые подпункты с текстом по `position`, до 50), `focus` (подсветка, если её пункт ещё жив и с текстом), `view`; `total/done` — по пунктам верхнего уровня. pgTAP — `034_mind_board_v2.test.sql`.

**Разбудка ночью (D-105, миграция `20260924095000_tv_wake`):** `tv_control(..., p_wake)` пересоздан: `true` ставит `awake_until = now() + 2 часа` (повтор — от нового «сейчас»), `false` — `null`; остальные команды колонку не трогают. Ночь (21:00–08:00) киоск считает по своим часам, пока `awake_until` впереди — стена в эфире. pgTAP — `027_tv_wake.test.sql`.

### inbox_items — staging голосового конвейера
`id, company_id, user_id, status inbox_status not null default 'recorded', audio_path text, transcript text null, entities jsonb null, client_request_id uuid null, recorded_at timestamptz null (когда директор отпустил лицо, по часам телефона — D-130; `created_at − recorded_at` = сколько фраза ждала на телефоне), created_at, updated_at`; `unique (company_id, client_request_id)` — одна строка на захват, NULL-ключи не сталкиваются (D-126). Заводит `/api/voice/upload-url` (`director_input`: сразу вставка, конфликт 23505 — ответ существующей строкой), дальше `transcribed` → `parsed` → `confirmed` (`confirm_voice_batch` по `payload.inbox_id`); `discarded` код не ставит. Черновики персистентны, датасет для evals собирается сам.

### recurrence_rules
`id, company_id, author_id, assignee_id, title not null, body null, priority task_priority, rrule text not null, is_active bool default true, next_run_at timestamptz null`, без `created_at`. Пишет `confirm_voice_batch` (сущность `recurrence`, `next_run_at = now`). Исполнителя, который порождает задачи по правилу, нет `[не построено]`.
### reminders
`id, company_id, user_id, text not null, remind_at timestamptz null, sent bool not null default false, created_at`. **Выведена из оборота (D-95):** напоминание — заметка с `remind_at`; сюда больше никто не пишет, старые строки перенесены в `notes` (связь — `notes.client_request_id = reminders.id`).
### notes — заметки директора (D-75)
`id, company_id, user_id, text not null, raw_transcript text null, audio_path text null, inbox_item_id uuid null → inbox_items (set null), pinned bool default false, converted_task_id uuid null → tasks (set null), converted_announcement_id uuid null → announcements (set null), converted_at timestamptz null, deleted_at timestamptz null (мягкое удаление; через 3 дня строку удаляет `notes_purge_trash`, D-95), remind_at timestamptz null (напомнить автору — D-95), reminded_at timestamptz null (ставит `notes_due_reminders`; новое `remind_at` сбрасывает его триггером), client_request_id uuid null (unique где not null), board_id uuid null → mind_boards (cascade; пункт доски, D-102), position double precision null (порядок на доске, дробный — перестановка пишет одну строку; обязателен у пункта — check), done_at timestamptz null (пункт отмечен), parent_id uuid null → notes (cascade; подпункт пункта доски, один уровень — D-121; `position` подпункта — порядок среди братьев), created_at, updated_at`. Правятся только `text`, `pinned`, `remind_at` и у пунктов `done_at` / `position` / `parent_id`; `raw_transcript`/`audio_path` — то, что было сказано, не меняются. Пишется `confirm_voice_batch` (сущность `note`; `payload.note_id` помечает заметку, из которой родилась задача или объявление — `converted_*`, `converted_at`) или напрямую с клиента под RLS (ввод на странице заметок). Состоит в публикации `supabase_realtime`.

### mind_boards — доски директора (D-102)
`id, company_id, user_id (автор), title text not null (1–120), deleted_at timestamptz null (мягкое удаление; через 3 дня строку вместе с пунктами удаляет `notes_purge_trash`), client_request_id uuid null (unique где not null), created_at, updated_at`. Контейнер: пункты — строки `notes` с `board_id`, подпункты — ещё и с `parent_id` (D-121): родитель — живой пункт верхнего уровня той же доски и того же автора, пункт с живыми подпунктами подпунктом не становится (`bad_parent`, триггер `trg_notes_branch_guard`); подпункт, вставленный под удалённый пункт, ложится в корзину с ним; возвращённый из корзины без своего пункта — становится пунктом. Корзина — веткой: удаление пункта уводит его живые подпункты с тем же `deleted_at`, возвращение — ровно их (`trg_notes_branch_cascade`). Пишется напрямую с клиента под RLS (ключ — с телефона, повтор перечитывает строку). `updated_at` поднимает и правка любого пункта (триггер) — «последние доски» на пульте. Состоит в публикации `supabase_realtime`.

### events + event_participants — календарь (D-78)
```
events: id, company_id, author_id, title not null, body null, location null,
        starts_at timestamptz not null, ends_at timestamptz null,
        remind_before_min int not null default 30 check (0..1440),
        everyone bool not null default false,   -- только для показа: состав материализован строками
        reminded_at timestamptz null,           -- ставит events_due_reminders; перенос обнуляет
        cancelled_at timestamptz null, audio_path null, source_transcript null,
        inbox_item_id uuid null → inbox_items (set null), created_at, updated_at
event_participants: event_id → events on delete cascade, user_id → profiles on delete cascade,
        status text not null default 'invited' check (status in ('invited','going','declined')),
        reason text null, responded_at timestamptz null, created_at,
        primary key (event_id, user_id)          -- без id и company_id
```
Мероприятие одно на всех, участники — строками, не копиями (в отличие от D-02); автор — всегда участник `going`. Создаёт `confirm_voice_batch` (сущность `event`); отвечает участник через `respond_event`, состав правит директор через `set_event_participants`; перенос и отмену директор пишет прямо в `events` под RLS. Видимость считают security-definer-функции `is_event_participant(event)` и `can_see_event(event)` — политики двух таблиц друг на друга не ссылаются (иначе рекурсия политик).

Правка — RPC `edit_event` (все поля и состав атомарно), удаление — `delete_event` (строки больше нет; D-94). Колонка `cancelled_at` и её ветка в триггере остаются для старых отменённых. Миграции `20260923200000_calendar_edit_delete`, `20260923201000_calendar_queued_refresh`, pgTAP `023_calendar_edit.test.sql`.

### errands — заявки секретарю (D-79)
```
id, company_id, author_id,              -- директор, который попросил
kind text not null,                     -- code из settings.secretary.actions
label text not null,                    -- надпись кнопки в момент просьбы (снимок)
note text null, status errand_status not null default 'sent',
claimed_by uuid null → profiles,        -- секретарь, который взял
decline_reason text null, audio_path null, source_transcript null,
inbox_item_id uuid null → inbox_items (set null), client_request_id uuid null (unique где not null),
escalated_at timestamptz null,          -- один повторный push ушёл
thanked_at timestamptz null,            -- «Спасибо ♥» директора (D-97), ставит thank_errand
due_at timestamptz null,                -- «к 18:00» — к какому моменту нужно (D-106 §8)
due_reminded_at timestamptz null,       -- одно напоминание за 10 мин до due_at ушло (errands_due_remind)
created_at, accepted_at null, done_at null, updated_at
```
Автомат `sent → accepted → done | declined | cancelled` — только RPC `transition_errand`; вставка — `/api/errands` под RLS. Очков, стены и ТВ у заявок нет (D-45, D-79 §10).

### visits — «К вам посетитель» (D-96)
Секретарь → директор (миграция `20260923230100_visits`). Колонки: `author_id` (секретарь), `note` (≤120, необязательно), `status` (`waiting → wait → invited | declined`, либо `expired`), `answered_by/at`, `tv_version` (версия `tv_state`, которая несла надпись), `shown_at` (квитанция стены: `tv_heartbeat` отметил эту версию), `closed_at` (карточку убрали), `client_request_id` (уникальный). Политик на запись нет — только `announce_visit` (secretary), `answer_visit` (director; `invited` включает гостя на час), `close_visit`; каждая поднимает версию стены через `tv_touch`. Outbox: `visit_arrived` директорам, `visit_answered` автору — мимо окна доставки; истечение — `visits_due_expiry` в минутном свипе. В публикации Realtime. pgTAP — `023_visits.test.sql`.

**Сообщение секретаря на стену (D-116)** — та же таблица, `kind` (`visitor` по умолчанию | `message`; миграция `20260924180000_visit_messages`). Проверка статуса по виду: посетитель — `waiting | wait | invited | declined | expired`, сообщение — `waiting → read | expired`; у сообщения `note` обязателен (`visits_message_note_check`). Outbox: `visit_message` директорам (категория «Секретарь»), автору — только `visit_answered` «Директор не прочитал» при истечении (30 минут); `read` снимает неушедший `visit_message`. `tv_overlay()` отдаёт свежее непрочитанное сообщение и их число, гостю — без текста; приглашённый визит больше не отдаёт. pgTAP — `032_visit_messages.test.sql`.

### consents — `[не построено]` (G.12)
Таблицы согласий нет; анонимизации «Сотрудник №N» по согласию нет ни в рейтинге, ни на ТВ.

## RLS — канонический паттерн (обязателен, не изобретать свой)

```sql
create or replace function auth_company_id() returns uuid
language sql stable security definer set search_path = public
as $$ select company_id from profiles where id = auth.uid() $$;

create or replace function auth_role() returns text
language sql stable security definer set search_path = public
as $$ select role::text from profiles where id = auth.uid() $$;

create or replace function subordinates(mgr uuid) returns setof uuid
language sql stable security definer set search_path = public
as $$ select id from profiles where manager_id = mgr $$;  -- manager: глубина 1, БЕЗ рекурсии
```

Эталонная пара политик (образец для всех таблиц) — tasks:

```sql
alter table tasks enable row level security;

create policy tasks_select on tasks for select using (
  company_id = auth_company_id()
  and (status <> 'scheduled' or author_id = auth.uid())   -- отложенные видит только автор
  and ( assignee_id = auth.uid() or author_id = auth.uid()
        or auth_role() = 'director'
        or (auth_role() = 'manager' and assignee_id in (select subordinates(auth.uid()))) )
);

create policy tasks_insert on tasks for insert with check (
  company_id = auth_company_id() and author_id = auth.uid()
  and auth_role() in ('director','manager')
);
```

Плюс `tasks_update` (та же видимость, `with check` своей компании) и `tasks_delete` (director, только `scheduled`). В новых политиках вызовы оборачивать в `(select auth.uid())` / `(select auth_company_id())` — initplan считается раз на запрос (так сделаны `task_messages`, `task_reads`, `notes`, `errands`).

Матрица по остальным таблицам:
- **profiles**: select — вся компания (через `auth_company_id()`, НЕ подзапросом к profiles — иначе рекурсия 42P17), кроме роли `tv` — она видит только собственную строку (нужна layout-гарду /tv); update — владелец (защищённые поля — `trg_profiles_guard`) + director + secretary (`profiles_update_secretary`: строка директора вне досягаемости, строка не уходит директорской — D-104); insert/delete — только service role. **companies**: select — компания, кроме `tv`; write — service role и RPC `update_company_settings` / `update_company_profile`.
- **task_messages**: select и insert — участники задачи (автор/исполнитель/директор/менеджер глубины 1; `sender_id = auth.uid()`); update/delete — нет (append-only, `answered_at` ставит триггер).
- **task_reads**: только свои строки — select/insert/update по `user_id = auth.uid()`, `company_id` сверяется с `auth_company_id()`; delete — нет (каскад от задачи).
- **point_transactions**: select — свои + director; insert/update/delete — нет (только security-definer-функции). Рейтинг клиентом из сырых транзакций НЕ читается — только `fn_rating()`.
- **shop_items**: select — компания, кроме `tv`; всё остальное — director/shopkeeper. **orders**: select — свои + director/shopkeeper; мутации — только RPC.
- **announcements**: select — компания, кроме `tv`; insert — director (автор — он сам); delete — director. **announcement_acks**: select — компания, кроме `tv`; insert — своё.
- **push_subscriptions**: select — свои + director; insert/delete — свои (приложение пишет через `/api/push/subscribe` и `/api/push/devices` service role'ом, строго от имени вызывающего).
- **notification_deliveries**: select — свои + director; запись — service role и security-definer-функции.
- **notification_prefs**: select — своя строка и только директору; записи нет — RPC `set_notify_prefs` (D-114).
- **ingest_batches, ai_logs**: select — director; запись — service role и security-definer-функции.
- **inbox_items**: select — автор + director; insert — своё; update — автор до `confirmed`.
- **recurrence_rules**: select — компания, кроме `tv`; insert/update/delete — director. **reminders**: select — свои; записи нет (таблица выведена из оборота, D-95).
- **tv_events**: select — `auth_role() in ('tv','director')` своей компании; политик на запись нет. **tv_state**: то же; запись — только `tv_control` / `tv_heartbeat` (и `tv_touch` изнутри функций визита, D-96). Роль `tv` не видит ничего, кроме своей строки `profiles`, `tv_events`, `tv_state` и вызовов `tv_summary` / `tv_focus` / `tv_calendar` / `tv_overlay` / `tv_board` / `tv_heartbeat`. Никакого anon.
- **visits** (D-96): select — директор и секретари своей компании; `tv` и остальные — никогда; политик на запись нет — только RPC `announce_visit` / `answer_visit` / `close_visit`.
- **notes**: все четыре операции — только автор (`user_id = auth.uid()` + своя компания); роль не проверяется намеренно — заметка приватна по автору, не по оргструктуре (D-75 §2): менеджер, второй директор и `tv` чужих заметок не видят. **mind_boards** — те же четыре политики по автору; `notes_insert` / `notes_update` дополнительно требуют, чтобы `board_id` был доской того же автора (D-102).
- **events**: select — компания, кроме `tv`: director — всё, остальные — автор или участник; update — director; insert/delete — нет (создаёт `confirm_voice_batch`). **event_participants**: select — кроме `tv`, кто видит мероприятие (`can_see_event`); запись — только RPC и `confirm_voice_batch`.
- **errands**: select — автор + любой `director` / `secretary` своей компании, `tv` никогда; insert — director (автор — он сам); update/delete — нет (только `transition_errand`).
- View нет. Функции клиентским ролям — перечисленные ниже security-definer-функции: `execute` отозван у `public`/`anon`, выдан `authenticated`; тики `events_due_reminders` и `errands_due_escalation` — только `service_role`.

## Атомарные операции — функции security definer (вызов через rpc())

Поведение и ошибки — BACKEND §3; здесь сигнатуры.

```sql
-- задачи и сообщения
confirm_voice_batch(payload jsonb, client_request_id uuid, p_now timestamptz default now()) returns jsonb
transition_task(task_id uuid, to_status task_status, payload jsonb default '{}', client_request_id uuid default null) returns jsonb
                                                              -- из rework в declined / pending_review — сам через accepted (D-128, D-130)
revoke_task(task_id uuid, client_request_id uuid default null) returns jsonb
extend_task_deadline(task_id uuid, new_deadline timestamptz, client_request_id uuid default null) returns jsonb
reassign_task(task_id uuid, new_assignee_id uuid, client_request_id uuid default null,
              new_deadline timestamptz default null, change_deadline boolean default false,
              note text default null) returns jsonb                                  -- D-128
request_deadline(task_id uuid, proposed timestamptz, words text default null,
                 client_request_id uuid default null) returns jsonb                  -- D-128, исполнитель
answer_deadline_request(task_id uuid, approve boolean, client_request_id uuid default null) returns jsonb   -- D-128, директор
nudge_task(task_id uuid, client_request_id uuid default null) returns jsonb          -- D-128, «Напомнить», раз в 30 мин
delete_task(task_id uuid) returns jsonb                       -- D-58
purge_closed_tasks() returns jsonb                            -- D-58
mark_thread_read(task_id uuid, seq bigint) returns bigint     -- D-61, D-64
next_delivery_slot(p_company uuid, p_now timestamptz default now()) returns timestamptz   -- D-38

-- доставка (D-114); тики — только service_role, из минутного свипа
publish_due_scheduled(p_now timestamptz default now()) returns int   -- scheduled → sent, tasks/017
send_task_now(task_id uuid, client_request_id uuid default null) returns jsonb   -- D-129: отложенное задачи — сейчас
send_announcements_now(announcement_ids uuid[], client_request_id uuid default null) returns jsonb   -- D-129
deadline_reminders_due(p_now timestamptz default now()) returns int  -- «Скоро срок» исполнителю за час (D-128)
claim_deliveries(p_limit int default 50) returns setof notification_deliveries   -- воркер берёт строки
push_when(p_at timestamptz, p_now timestamptz default now()) returns text   -- «сегодня 18:00» словами карточки — тексты пушей (D-125)
set_notify_prefs(p_prefs jsonb) returns jsonb           -- только директор; перестраивает ждущую очередь
push_health() returns table (user_id, devices, enabled_devices, last_ok_at, last_error, last_error_at,
                             last_seen_at, no_device_at)   -- директору и секретарю
unseen_task_alerts_due(p_now timestamptz default now()) returns int   -- «Задача не принята» (с 20260924160000)
team_channel_alerts_due(p_now timestamptz default now()) returns int  -- «Уведомления не доходят», раз в неделю на человека
notification_deliveries_purge(p_now, p_keep_days int default 30, p_stale_days int default 7, p_batch int default 2000) returns int   -- самоочистка
overdue_alerts_due(p_now timestamptz default now()) returns int       -- «Просрочено»
director_day_summaries_due(p_now timestamptz default now()) returns int   -- «Итог дня»
director_digests_due(p_now timestamptz default now()) returns int     -- сводки
-- служебные: notify_prefs_defaults(), notify_prefs_of(user), delivery_category(kind, meta), notify_hhmm(text, time),
-- director_quiet_until(prefs, at), director_meeting_until(user, at), director_digest_slot(prefs, at), ru_plural(n, …)

-- очки, настройки
award_points(p_user_id uuid, p_amount int, p_reason text, client_request_id uuid default null) returns jsonb
fn_rating(p_from timestamptz, p_to timestamptz)
  returns table (user_id uuid, display_name text, points int, rank int,
                 delta_vs_prev int, on_time_pct numeric, is_me boolean)
-- состав — активные team_role(); rating_mode='top5' — топ-5 + строка запрашивающего; директору — все
update_company_settings(patch jsonb) returns jsonb            -- director, secretary (D-104), settings || patch
update_company_profile(p_name text) returns jsonb             -- director, secretary (D-104), название 1–120

-- магазин (hold-final, D-10)
create_shop_order(p_item_id uuid, client_request_id uuid default null) returns jsonb
-- pg_advisory_xact_lock(hashtext('points:'||auth.uid())) → SUM-баланс ≥ price
-- → select stock for update, stock>0 → insert order(price снапшот, stock_reserved) + shop_hold + stock-1
cancel_shop_order(p_order_id uuid, client_request_id uuid default null) returns jsonb
set_shop_order_status(p_order_id uuid, p_status order_status, client_request_id uuid default null) returns jsonb

-- календарь (D-78)
respond_event(p_event uuid, p_status text, p_reason text default null) returns event_participants
set_event_participants(p_event uuid, p_add uuid[] default '{}', p_remove uuid[] default '{}') returns void
events_due_reminders(p_now timestamptz default now()) returns int        -- только service_role
edit_event(p_event uuid, p_title text, p_starts_at timestamptz, p_ends_at timestamptz default null, p_location text default null,
           p_body text default null, p_remind_before_min int default 30, p_everyone boolean default false,
           p_participant_ids uuid[] default '{}') returns events   -- D-94, без client_request_id
delete_event(p_event uuid) returns void                                   -- D-94

-- заметки (D-95)
notes_due_reminders(p_now timestamptz default now()) returns int         -- только service_role
notes_purge_trash(p_now timestamptz default now()) returns int           -- только service_role, корзина старше 3 дней

-- заявки (D-79)
transition_errand(p_id uuid, p_to text, p_reason text default null, client_request_id uuid default null) returns jsonb
errands_due_escalation(p_now timestamptz default now()) returns int      -- только service_role
errands_due_remind(p_now timestamptz default now()) returns int          -- только service_role; D-106 §8
thank_errand(p_id uuid, client_request_id uuid default null) returns jsonb   -- D-97

-- посетители (D-96)
announce_visit(p_note text default null, client_request_id uuid default null, p_kind text default 'visitor') returns visits  -- D-116: 'message'
answer_visit(p_id uuid, p_answer text) returns visits
close_visit(p_id uuid) returns visits
visits_due_expiry(p_now timestamptz default now()) returns int           -- только service_role

-- ТВ (D-76)
tv_control(p_mode text, p_employee_id uuid, p_task_id uuid, p_scene text, p_guest boolean, p_reload boolean, p_clock text, p_calendar text, p_board uuid, p_board_guest boolean, p_wake boolean, p_rating text, p_carousel boolean) returns tv_state   -- p_board* — D-102, p_wake — D-105, p_rating/p_carousel — D-123
tv_rating(p_guest boolean default false, p_period text default 'week') returns jsonb   -- заставка «Рейтинг», D-123
tv_board(p_guest boolean default false) returns jsonb   -- доска на стене для киоска, D-102; ветки, подсветка и вид — D-121
tv_board_control(p_point uuid default null, p_clear_point boolean default false, p_view text default null) returns tv_state   -- ведущий с пульта, D-121
tv_focus() returns jsonb   -- v3: дела с историей, сданное за неделю, рейтинг человека, D-120
tv_task_story(p_task uuid) returns jsonb   -- история дела для стены, только изнутри tv_focus, D-120
tv_heartbeat(p_applied_version int default null) returns void
tv_summary(p_guest boolean default false) returns jsonb
-- пульс дня, ближайшие мероприятия, вердикт числами, три числа дня, топ-5 недели (fn_rating),
-- загрузка людей (team_role), неделя, выдачи; при p_guest — маскированные поля; роли tv/director
tv_calendar(p_guest boolean default false, p_days int default 7, p_from date default null) returns jsonb   -- D-96; до 42 дней с p_from (месяц), D-98
tv_overlay() returns jsonb                                                -- D-96, D-116: посетитель, сообщение секретаря
tv_touch(p_company uuid, p_guest_minutes int default null) returns int  -- внутренняя: поднять версию стены
tv_events_prune(p_days int default 30) returns int

-- хелперы
auth_company_id(), auth_role(), subordinates(mgr uuid)       -- RLS-паттерн выше
team_role(r user_role) returns boolean                        -- employee, manager, shopkeeper, secretary
is_event_participant(p_event uuid), can_see_event(p_event uuid) returns boolean
tv_emit(p_company, p_kind, p_actor, p_task, p_title, p_amount, p_title_guest) returns void   -- внутренняя, для проекций
```

Переходы статусов задач — только через `transition_task` (+ `revoke_task`, `reassign_task`); списания очков — только через перечисленные функции.

## Триггеры

1. `trg_task_status_guard` (before update of status on tasks) — матрица переходов; штампы `accepted_at` / `completed_at` / `closed_at` ставит только он (клиентское значение игнорируется).
2. `trg_tasks_field_guard` (before update on tasks) — не-директор и не-автор меняет ТОЛЬКО `status`; без перехода штампы заморожены.
3. `trg_task_status_message` (after update of status) — строка `status_change` в task_messages.
4. `trg_question_answered` (after insert on task_messages) — первое сообщение автора задачи проставляет `meta.answered_at` открытым вопросам этой задачи; строка «Напомнить» (`meta.nudge`) ответом не считается (D-128).
4a. `trg_close_time_requests` (after update of status on tasks) — задача ушла из рук исполнителя (сдана, отказ, закрыта, отозвана) — ждущая просьба о сроке закрывается `answer='closed'` (D-128).
5. `trg_profiles_guard` (before update on profiles) — не-директор не меняет `role`, `company_id`, `is_active`, `manager_id`, `streak_*`; секретарь на чужой строке меняет `role`, `is_active`, `manager_id`, но не трогает директора и никого им не делает, на своей — как все (D-104, миграция `20260924100000_secretary_admin`); service role (`auth.uid()` null) — без ограничений.
6. `trg_point_transactions_hold_guard` (constraint trigger after insert on point_transactions, deferrable initially immediate) — только для `shop_hold`: баланс < 0 → `insufficient_points`.
7. Outbox (только вставка строк): `trg_notify_outbox_tasks` (after insert or update of status on tasks), `trg_notify_outbox_messages` (after insert on task_messages), `trg_notify_outbox_announcements` (after insert on announcements), `trg_notify_outbox_event_participant` (after insert on event_participants), `trg_notify_outbox_event` (after update on events), `trg_notify_outbox_errand` (after insert or update of status on errands); `trg_notification_deliveries_deliver_after` (before insert on notification_deliveries) — окно доставки.
8. Проекции ТВ: `trg_tv_events_task` (after insert or update on tasks), `trg_tv_events_points` (after insert on point_transactions), `trg_tv_events_announcement` (after insert on announcements), `trg_tv_events_order` (after update on orders).
9. `trg_events_reset_reminder` (before update on events) — перенос `starts_at` обнуляет `reminded_at`.
10. `moddatetime` (extension) — `updated_at` на tasks, inbox_items, shop_items, orders, notes, mind_boards, tv_state, events, errands.
11. `trg_notes_mind_board` (after insert/update/delete on notes, пункты досок) поднимает `mind_boards.updated_at`; `trg_mind_boards_touch_tv` (after update on mind_boards) зовёт `tv_touch`, если доска на стене (D-102). `trg_notes_branch_guard` (before insert or update of parent_id, board_id, deleted_at on notes) держит форму ветки, `trg_notes_branch_cascade` (after update of deleted_at on notes) водит подпункты в корзину и обратно с пунктом, `trg_tv_state_board_point` (before update on tv_state) гасит подсветку при смене доски или сцены (D-121).

## Индексы (полный список; ставит миграция, не «агент по вкусу»)

```
profiles (company_id);
tasks (company_id, assignee_id, status);  tasks (company_id, deadline)
  where status in ('sent','accepted','in_progress','rework');       -- скан просрочек
tasks (company_id, status) where status='pending_review';  tasks (group_id);
task_messages (task_id, created_at);  task_messages (company_id, seq desc);  task_messages (task_id, seq desc);
task_messages (task_id, created_at desc) where meta->>'is_question' = 'true' or meta->>'decline_reason' = 'true';
ai_logs (company_id, created_at);  ai_logs (company_id, client_request_id, kind);
announcements (company_id, created_at desc);  inbox_items (company_id, user_id);
recurrence_rules (next_run_at) where is_active;  reminders (remind_at) where not sent;
point_transactions (company_id, user_id, created_at);
push_subscriptions (user_id);
notes (user_id, created_at desc) where deleted_at is null;  notes (client_request_id) unique where not null;
notes (remind_at) where remind_at is not null and reminded_at is null and deleted_at is null;  notes (deleted_at) where deleted_at is not null;
notes (board_id, position) where board_id is not null;   -- пункты доски по порядку, D-102
notes (parent_id, position) where parent_id is not null;   -- подпункты пункта по порядку, D-121
mind_boards (user_id, updated_at desc) where deleted_at is null;  mind_boards (client_request_id) unique where not null;  mind_boards (deleted_at) where deleted_at is not null;
notification_deliveries (status, created_at) where status='queued';
notification_deliveries (task_id, event_kind);  notification_deliveries (user_id, status);
notification_deliveries_due_idx (status, channel, deliver_after) where status='queued';
shop_items (company_id, is_active, sort, price);
orders (company_id, user_id, created_at desc);  orders (company_id, status, created_at);
tv_events (company_id, created_at desc);
notes (user_id, created_at desc) where deleted_at is null;
events (company_id, starts_at) where cancelled_at is null;
events (starts_at) where reminded_at is null and cancelled_at is null;   -- минутный тик
event_participants (user_id);
errands (company_id, created_at desc) where status in ('sent','accepted');  errands (author_id, created_at desc);
+ unique: point_transactions (task_id, rule_code) where source='auto_rule'; point_transactions (order_id, source) where order_id is not null;
  ingest_batches (company_id, client_request_id); push_subscriptions (endpoint);
  notes (client_request_id) where not null; errands (client_request_id) where not null
```

## Storage

| Бакет | Доступ | Путь | Политики |
|---|---|---|---|
| `voice` | private | `{company_id}/{owner_id}/{client_request_id}.{ext}` | insert и select — владелец в свою папку (сегменты `storage.foldername(name)`); update/delete — нет |
| `photos` | private, ≤10 МБ, JPEG/PNG/WebP | `{company_id}/{owner_id}/{client_request_id}.{ext}` | как у `voice` (G.20b) |
| `brand` | public, ≤2 МБ, PNG/JPEG/WebP/SVG | `{company_id}/logo-{stamp}.{ext}` | чтение — всем (экран входа до логина); пишет сервер service role (G.20d) |

Бакетов `shop` и `avatars` нет. Любое чтение чужого файла (директор слушает аудио, адресат слушает оригинал задачи, участник открывает фото) — **только signed URL, выданный сервером** после проверки прав: `/api/voice/audio-url`, `/api/files/url`. Загрузка клиентом — напрямую в Storage по signed upload URL (лимит Vercel 4.5 МБ). Срок хранения аудио — `[не построено]`: аудио копится бессрочно (D-18 ◐, D-66 п.6); транскрипты — вечно.

## Расписание — минутный тик (вместо pg_cron)

pg_cron и pg_net не подключены. Единственное расписание — Vercel cron `vercel.json`: `* * * * *` → `/api/push/sweep` (под `CRON_SECRET`, BACKEND §10). Один вызов: `deadline_reminders_due()` (D-128), `events_due_reminders()`, `errands_due_escalation()`, `errands_due_remind()` (D-106 §8), `notes_due_reminders()` и `notes_purge_trash()` (D-95), `visits_due_expiry()` (D-96), затем рассылка outbox. Выпуск `scheduled → sent` (`publish_due_scheduled`) — `[не построено]`, наряд 017.

Исполнителя нет `[не построено]` у: `recurrence_rules` (записываются, не исполняются), пометки просрочек и авто-очков (D-28), streak, вечерней сводки, еженедельной проверки подписок, чистки аудио (D-18), чистки `tv_events` (`tv_events_prune`). Существующие шаги тика идемпотентны отметкой в самой строке — `events.reminded_at`, `errands.escalated_at`, `notes.reminded_at`.

## Миграции — дисциплина

- Имя: `YYYYMMDDHHMMSS_описание.sql`. **Одна миграция = одна фича.** Правка старых миграций запрещена; откат — новой миграцией. `create or replace function` в новой миграции несёт тело функции целиком.
- Новое значение enum — отдельной миграцией (его нельзя использовать в той же транзакции, D-79 §2).
- Dev — `pnpm db:push`. В прод — только `supabase migration up` через CI; **`db push` в прод запрещён**. Прод-проекта и CI пока нет (D-19 🔴) `[не построено]`; при флоте инстансов — миграции на весь флот через CI (V-02).

## seed.sql (dev-фикстуры; обязателен для RLS-тестов и Пульса)

Демо-компания «Demo Group», в `settings` — только `delivery_window` (остальное — дефолты кода). pgTAP ставится здесь (`create extension pgtap with schema extensions`), а не миграцией — фреймворк тестов не должен уезжать в прод; `supabase db lint` гонять с `--schema public` (код pgTAP даёт ложные error в схеме `extensions`). Демо-пароль всех аккаунтов `demo1234`, строки `auth.identities` обязательны для входа по паролю; строковые токен-колонки `auth.users` (`confirmation_token`, `recovery_token`, `email_change*`, `phone_change*`, `reauthentication_token`) сидятся `''` — с NULL GoTrue отвечает 500 на любой вход. 9 профилей: director, manager, shopkeeper, служебный tv, 4 employee и тестовый director «ТЕСТ» (`test@demo.local` / `1`, только dev); секретаря нет. Алиасы-коллизии: **«Ерлан Байжанов» (aliases: Ерлан, Ерлан Б.) и «Ерлан Досов» (aliases: Ерлан, Ерлан Д.)** — фикстура матчера; Марат — подчинённый менеджера; «Айгуль» — `availability='vacation'`. Задачи во **всех** статусах enum (включая scheduled, revoked, rework; в `sent` — две, они же group_id-пара), один открытый вопрос, одна причина отказа, одна просрочка; одно объявление с подтверждением; строка разбора в `ai_logs` и черновик `inbox_items` для `confirm_voice_batch`; объект Storage в `voice` (файл Айгуль — чужим недоступен по политике). Очков, товаров, заказов, мероприятий и заявок в сиде нет.

## RLS-тесты (pgTAP, `supabase/tests/`, запуск `pnpm test:rls` = `supabase test db --linked`)

| Файл | Что проверяет |
|---|---|
| `001_rls_tasks.test.sql` | видимость задач: чужая, `scheduled`, менеджер своей и чужой группы, anon |
| `002_rls_profiles.test.sql` | профили читаются компанией, защищённые поля не пишутся |
| `003_task_status_guard.test.sql` | матрица переходов `trg_task_status_guard` |
| `004_question_answered.test.sql` | первый ответ автора закрывает открытые вопросы (G.7) |
| `005_guards.test.sql` | изоляция `tv`, `trg_tasks_field_guard`, штампы, защищённые поля профиля, обход service role |
| `006_voice_pipeline.test.sql` | RLS staging-таблиц, бакет `voice`, `confirm_voice_batch`: идемпотентность, копии мульти-исполнителя, окно доставки, очки за флагом |
| `007_task_rpc.test.sql` | `transition_task` / `revoke_task`: матрица, «Настоять», отзыв, идемпотентность |
| `008_declined_revoke.test.sql` | «Отменить» у `declined`; `done` остаётся финальным |
| `009_points.test.sql` | очки за флагом, `award_points`, `fn_rating` (в т.ч. `top5` от сотрудника), `update_company_settings` |
| `010_delivery.test.sql` | outbox: триггеры ставят строки, квитанции видят директор и адресат, подписки строго свои |
| `011_extend_reassign.test.sql` | `extend_task_deadline`, `reassign_task` |
| `012_outbox_replies.test.sql` | ответные события исполнителю: доработка, приёмка, отзыв |
| `013_delete_tasks.test.sql` | `delete_task`, `purge_closed_tasks` — только директор |
| `014_task_reads.test.sql` | курсоры прочтения приватны |
| `015_mark_thread_read.test.sql` | курсор только вперёд, чужим не становится |
| `016_message_deliveries.test.sql` | одно событие `message` на получателя, схлопывание, без дублей со своими событиями |
| `017_report_in_transition.test.sql` | отчёт внутри перехода: одна транзакция, один ключ, без второго пуша |
| `018_notes.test.sql` | заметки: `confirm_voice_batch` пишет `note`, чужую никто не видит и не правит |
| `019_tv_state.test.sql` | пульт ТВ: командует только директор, киоск читает и квитирует, сотрудник не видит |
| `020_calendar.test.sql` | мероприятия: состав, видимость своих, ответы, минутный тик |
| `021_errands.test.sql` | заявки: уходят всем секретарям, забирает первая, другие роли не видят |
| `022_tv_wall_v2.test.sql` | стена v2: часы и календарь пультом, гость с таймером, карточка сотрудника по стадиям, неделя для киоска |
| `023_visits.test.sql` | «К вам посетитель»: объявляет секретарь, отвечает директор, квитанция стены, маска гостя, истечение |
| `024_tv_calendar_month.test.sql` | календарь на стене: «Неделя / Месяц» пультом, шесть недель для киоска |
| `025_mind_boards.test.sql` | доски: приватность по автору, пункт только на свою доску, на стену — только автор, киоск читает функцией, гость, версия стены, корзина |
| `026_secretary_admin.test.sql` | секретарь: правит чужие карточки и роли, кроме директора, директором никого не делает, своё не трогает; настройки и название компании — да, сотрудник — нет (D-104) |
| `027_tv_wake.test.sql` | разбудка стены: два часа от «сейчас», `false` усыпляет, другие команды не трогают, будит только директор |
| `038_task_lifecycle.test.sql` | жизнь задачи (D-128): «Не могу» с доработки и подсказка коллеги (себя — нет), просьба о сроке и ответы, «Срок» раньше / позже, «Напомнить» раз в полчаса без закрытия вопроса, передача со сроком и словом, «Скоро срок» раз на срок, «Просрочено» молчит при просьбе, `passed_to` не пишет сотрудник |
| `035_tv_wall_v4.test.sql` | стена v4: заставка «Рейтинг» и её период пультом, круг выключается выбором руками и снимает доску; пятёрка без шестого, награды без штрафов и магазина, гостю скрыто, без очков — нет; одно дело: отказ не встаёт, ставший отказом снимается (D-123) |
| `033_tv_focus_story.test.sql` | стена v3: история дела видом и временем, без слов, отказа и комментария к доработке; место только из пятёрки, очки для любого места, гостю без рейтинга; хелпер истории напрямую не зовут (D-120) |
| `032_visit_messages.test.sql` | сообщение секретаря на стену: только со словами, пуш директору, «Понятно» только директор и только сообщению, маска гостя, «Заходите» нет, 30 минут без ответа (D-116); счёт по своим строкам — проходит и на dev |

Магазинные RPC (`create_shop_order` и соседние) не покрыты ни одним тестом; проекции `tv_events` проверены только для вида `event` (`020`).
