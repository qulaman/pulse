# DATABASE.md — схема данных Pulse (Supabase / Postgres)

Что это: контракт схемы БД Pulse (таблицы, RLS, функции, триггеры, индексы, cron) — для агентов, пишущих миграции. **Единственный источник правды по схеме — миграции в `/supabase/migrations`; этот документ — контракт для их создания. Арбитр — `DECISIONS.md`.** При расхождении: DECISIONS.md > этот файл > остальные доки.

Модель SaaS — V-02: одна БД = один клиент, изолированный инстанс (свой Supabase-проект) на каждую компанию клиента. `company_id` и RLS при этом СОХРАНЯЮТСЯ во всех таблицах — как защита ролей внутри компании и страховка архитектуры. Кросс-клиентской логики нет; всё клиентское — в `company.settings`.

## Общие правила

- Везде `id uuid primary key default gen_random_uuid()`, `company_id uuid not null references companies`, `created_at timestamptz not null default now()` — ниже не повторяются (исключения оговорены).
- Все времена — `timestamptz` (UTC); отображение — Asia/Aqtobe (UTC+5).
- Enum через `create type`. RLS — в той же миграции, где создаётся таблица; deny by default.
- Баланс очков = `SUM(point_transactions.amount)`, никогда не поле. Append-only.
- Просрочка — **вычислимое свойство**, НЕ колонка: `deadline < now() and status in ('sent','accepted','in_progress','rework')`. Колонку `is_overdue` не добавлять.
- Materialized views **не используем** — только обычные view `with (security_invoker = on)`; MV — лишь по факту измеренных медленных запросов.
- Партиционирование **не нужно**; порог пересмотра — 10 млн строк в task_messages. `company_id` — первым столбцом составных индексов.
- `point_balance_checkpoints (user_id, as_of, balance)` — зарезервировано, **на этапе MVP-ядра не строить**.

## Enum-типы

```sql
create type user_role      as enum ('director','manager','employee','shopkeeper','tv');
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
create type absence_kind   as enum ('vacation','sick','other');
create type inbox_status   as enum ('recorded','transcribed','parsed','confirmed','discarded');
```

Статусная машина: `scheduled → sent → accepted → in_progress → pending_review → done | rework(→accepted) | declined`; `revoked` — терминальный, из любого нетерминального (отзыв директором). `in_progress` в enum есть, **в UI v1 не используется** (accepted → сразу pending_review). Переходы валидирует триггер `trg_task_status_guard`.

## Таблицы

### companies
`id, name text, settings jsonb not null default '{}'`, created_at. settings: правила авто-очков и их вкл/выкл (автоштрафы по умолчанию ВЫКЛ — D-28), публичность рейтинга `rating_mode: 'top5'|'full'`, реакция→очки map, тихие часы, таймаут эскалации Telegram (мин, default 10).

### profiles (расширение auth.users; id = fk auth.users, без default)
```
id uuid pk references auth.users, company_id, full_name text, role user_role,
position text null, avatar_url text null,
aliases text[] not null default '{}',        -- «Ерлан», «Ерлан Б.» для матчинга
manager_id uuid null references profiles,     -- делегирование, глубина 1
telegram_chat_id bigint null,
is_active bool not null default true,         -- оффбординг: false = вне рейтинга/матчинга/рассылок
availability availability_t not null default 'active',
settings jsonb not null default '{}',         -- quiet_mode, effects_enabled, push_prefs
streak_count int not null default 0, streak_updated_at timestamptz null
```
Роль `tv` — служебный auth-пользователь киоска (создаёт директор).

### tasks
```
id, company_id, author_id, assignee_id, parent_task_id uuid null,
group_id uuid null,                    -- мульти-исполнитель: N задач-копий с общим group_id (D-02)
title text, body text null, deadline timestamptz null, priority task_priority default 'normal',
status task_status not null default 'sent',
source ai_source null, source_audio_path text null, source_transcript text null,
scheduled_send_at timestamptz null,    -- только при status='scheduled'
recurrence_rule_id uuid null,
accepted_at, completed_at, closed_at timestamptz null,
updated_at timestamptz not null default now()   -- moddatetime
```
Правило: **все** выборки лент, пушей, Пульса, ТВ фильтруют `status <> 'scheduled'` (или RLS-условие ниже). Push уходит только на переходе scheduled→sent. Дедлайн без значения = null («без дедлайна», парсер не выдумывает).

### task_messages — ядро событийной модели
```
id, company_id, task_id, sender_id,
seq bigserial,                         -- монотонный курсор: клиент догоняет where seq > :last_seq
type message_type, content text null, file_path text null,
meta jsonb not null default '{}'
```
Всё происходящее с задачей — строка здесь; Пульс/лента/ТВ читают отсюда. `meta`: `status_change` → `{old_status,new_status}`; вопрос сотрудника → `meta.is_question=true`, `meta.answered_at` проставляет триггер при **первом** последующем сообщении директора (стопка «Вопросы» = is_question без answered_at, задача не терминальна); реакция → строка `type='system'`, `meta={kind:'reaction', emoji, message_id}` от триггера на reactions (типа `reaction_ref` в enum НЕТ). Таблицы `task_events`/`feed_items` **не вводить** — task_messages+seq и tv_events закрывают ленты (DECISIONS.md, раздел G).

### task_reads — курсор прочтения треда (D-61)
`task_id fk tasks (cascade), user_id fk profiles (cascade), company_id fk companies, last_seq bigint default 0, seen_at timestamptz`, PK (task_id, user_id). Одна строка на человека и задачу: сообщения треда с `seq > last_seq` для него непрочитаны. Читает только сам человек (RLS `user_id = auth.uid()`); пишет **только RPC `mark_thread_read(task_id, seq)`** (security definer, `greatest(old, new)` — курсор монотонный, оффлайн-повтор старого «Прочитал» его не откатывает; та же транзакция ставит `acted_at` квитанциям `message` треда, D-64). Прямые insert/update-политики «своё» остались как страховка, клиент ими не пользуется. Двигают курсор: открытие треда (страница и шторка), «Прочитал» на карточке и в шторке уведомления (`/api/push/acted`), собственный ответ. «Сообщения» Пульса и Ленты = задачи, где последнее настоящее сообщение (text/voice/photo, не status_change/system) — **не моё и выше моего курсора** (читающий любой: директор, менеджер, сотрудник), плюс открытые вопросы (`is_question` без `answered_at`). Флаг «прочитано» на самом сообщении не вводить: сообщения общие и append-only, курсор — личный.

### announcements (Эфир)
`id, company_id, author_id, audio_path text null, transcript text, created_at`. Индекс `(company_id, created_at desc)`.
### announcement_acks
`announcement_id, user_id, created_at`, PK (announcement_id, user_id).

### point_transactions — append-only
```
id, company_id, user_id, amount int check (amount <> 0),
reason text not null check (length(trim(reason)) > 0),
source point_source, rule_code text null,   -- 'on_time'|'early'|'overdue_penalty'|'fast_accept'|'reaction_fire'
task_id uuid null, order_id uuid null, actor_id uuid null, created_at
```
Идемпотентность авто-правил: `create unique index on point_transactions(task_id, rule_code) where source='auto_rule'`, insert'ы `on conflict do nothing`; бонус — только за **первый** done (повторный после rework не даёт — закрыто этим же ключом, D-31). Заморозка магазина — **hold-final** (D-10): заказ → `shop_hold`(−price); отмена → `shop_release`(+price, ровно сумма hold по order_id); выдача → новых транзакций НЕТ, hold финален. Максимум один hold и один release на заказ: `create unique index on point_transactions(order_id, source) where order_id is not null`.

### reactions
`id, company_id, message_id fk task_messages, author_id, emoji text`, unique (message_id, author_id). author_id — любой участник; очки (`reaction_fire`) начисляет триггер только за реакцию директора.

### shop_items / orders
```
shop_items: id, company_id, title, description null, icon null, photo_path null,
            price int check (price > 0),
            stock int null check (stock >= 0),   -- null = без ограничения, 0 = закончился
            is_active bool default true, sort int default 100, created_at, updated_at
orders: id, company_id, user_id, item_id references shop_items on delete restrict,
        price int not null,           -- снапшот цены на момент заказа
        status order_status default 'pending', created_at,
        approved_at null, delivered_at null, updated_at
```
`icon` — эмодзи, пока у компании нет фото награды (`photo_path` его перебивает); `description` — одна строка «что человек получает». Стартовая витрина ставится миграцией любой компании, у которой витрины ещё нет (состав и цены — D-71, правятся как данные).
Ассортимент правит директор прямо из приложения (экран «Магазин»): запись в `shop_items` идёт **не через RPC, а обычным upsert под RLS** — id выдаётся клиентом заранее, поэтому повтор запроса не создаёт второй товар. Товар с заказами не удаляется — `is_active=false`. Отмена pending — сам сотрудник, director, shopkeeper; после approved — только director/shopkeeper (D-37). Мутации — только через RPC ниже.

### push_subscriptions
`id, company_id, user_id, endpoint text unique, p256dh text, auth text, created_at`.

### notification_deliveries — outbox доставки
```
id, company_id, user_id, task_id uuid null, event_kind text,
channel delivery_channel, status delivery_status not null default 'queued',
attempts int not null default 0, last_error text null,
deliver_after timestamptz not null default now(),   -- when the row may leave: quiet hours as data (D-51)
created_at, sent_at, seen_at, acted_at timestamptz null
```
Триггеры БД **вставляют строку**, не зовут HTTP; отправляет cron-свип. `event_kind` (текст, `meta` несёт title/body/url — воркер ничего не сочиняет): директору — `question`, `pending_review`, `declined`; сотруднику — `task_sent`, и с 2026-09-11 (владелец, миграция `20260911210000_outbox_replies.sql`) `reply` (директор написал в треде: текст/голос/фото), `rework`, `done`, `revoked` (из открытых статусов, в т.ч. после переназначения), `deadline_extended` («Срок продлён до …»); всем — `announcement`. **Тихие часы** — триггер `notification_deliveries_deliver_after` (миграция `20260911230000`): для `reply / rework / done / revoked / deadline_extended / announcement` ставит `deliver_after = next_delivery_slot(company, now())` (открытие окна компании, если сейчас вне окна), остальные уходят сразу; воркер берёт только `deliver_after <= now()`, индекс `notification_deliveries_due_idx`. Эскалация: канал N+1 (telegram) стреляет, только если по N нет seen_at за таймаут из settings. `sms` в enum есть, в v1 не отправляется (D-41). Индикатор директора = «не открывал с HH:MM» (нет seen_at), не «не получил».

### ingest_batches — идемпотентность мутаций
`id, company_id, user_id, client_request_id uuid not null, result jsonb not null, created_at`, `unique (company_id, client_request_id)`. При дубле confirm возвращается сохранённый result (те же id сущностей). `client_request_id` обязателен на всех мутирующих эндпоинтах.

### ai_logs
```
id, company_id, user_id, kind ai_log_kind, source ai_source null,
provider text, model text,
transcript text null, raw_response jsonb null,
parsed_entities jsonb null, confirmed_entities jsonb null,
was_edited bool null, edit_fields text[] null,      -- метрика «доля правок»
tool_calls jsonb null,
input_tokens int null, output_tokens int null, cache_read_tokens int null,
stt_ms int null, parse_ms int null, latency_ms int null,
status text not null,                                -- 'ok'|'error:<код>'
client_request_id uuid null, request_id text null, created_at
```
`/api/voice/confirm` обязан дописать confirmed_entities/was_edited/edit_fields по тому же client_request_id.

### tv_events
```
id, company_id, seq bigserial, kind text,
payload jsonb not null, payload_guest jsonb not null, created_at
```
Наполняется триггерами на task_messages/point_transactions/orders/announcements. **Маскирование — при записи**: payload_guest строит триггер (имя → «Имя Ф.», без согласия по consents — «Сотрудник №N»; без сумм очков; заголовки задач → «Задача №…»). Kind: `task_sent, task_done, task_overdue, points_awarded, merch_ordered, merch_delivered, announcement, reaction, streak`.

### absences
`id, company_id, user_id, kind absence_kind, starts_on date, ends_on date, created_by uuid, created_at`. Вводит директор. Влияет: заморозка streak, серая точка в «Людях», авто-правила не штрафуют в период absence.

### inbox_items — staging голосового конвейера
`id, company_id, user_id, status inbox_status not null default 'recorded', audio_path text, transcript text null, entities jsonb null, client_request_id uuid null, created_at, updated_at`. Жизненный цикл recorded→transcribed→parsed→confirmed|discarded; черновики персистентны, датасет для evals собирается сам.

### consents
`id, company_id, user_id, kind text, version text, granted_at timestamptz`, unique (user_id, kind, version). Без действующего согласия соответствующего kind — анонимизация на ТВ/рейтинге («Сотрудник №N»).

### recurrence_rules
`id, company_id, author_id, assignee_id, title, body, priority, rrule text, is_active bool, next_run_at timestamptz`.
### reminders
`id, company_id, user_id, text, remind_at timestamptz, sent bool default false`.

## Представления (обычные view, security_invoker = on)

### v_pulse_summary — одна строка на company_id, контракт колонок
| колонка | тип | правило |
|---|---|---|
| company_id | uuid | |
| verdict | text | `'red'` если overdue_count>0; иначе `'yellow'` если review_count+question_count>0; иначе `'green'` |
| review_count | int | tasks в `pending_review` |
| question_count | int | открытые вопросы: `meta.is_question` без `answered_at`, задача не терминальна |
| overdue_count | int | вычислимая просрочка (формула выше) |
| orders_pending_count | int | orders в `pending` |
| done_week / done_week_prev | int | done за текущие/предыдущие 7 дней (дельта = разность, считает клиент) |
| on_time_pct / on_time_pct_prev | numeric | % done с closed_at ≤ deadline, окна 7 дней |
| avg_accept_min / avg_accept_min_prev | numeric | avg(accepted_at − created_at), окна 7 дней |

Счётчики — по `status <> 'scheduled'`. Пульс = 1 запрос этой view + v_employee_load.

### v_employee_load — строка на активного сотрудника
`user_id, full_name, avatar_url, availability, active_count int, overdue_count int, nearest_deadline timestamptz null, load_color text`.
`load_color`: `'gray'` если нет активных задач ИЛИ действующая absence/availability≠active; иначе `'red'` если overdue_count>0; иначе `'yellow'` если nearest_deadline < now()+interval '24 hours'; иначе `'green'` (задача без дедлайна = green). Активные = status in ('sent','accepted','in_progress','rework','pending_review').

### v_user_holds
`user_id, hold_total int` — SUM hold'ов по orders в pending|approved (цифра «заморожено» в UI).

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

Матрица по остальным таблицам:
- **profiles**: select — вся компания (через `auth_company_id()`, НЕ подзапросом к profiles — иначе рекурсия 42P17), кроме роли `tv` — она видит только собственную строку (нужна layout-гарду /tv); update — владелец (защищённые поля — триггер 9) + director. **companies**: select — компания, кроме `tv`; write — только service role.
- **task_messages / reactions**: участники задачи (author/assignee/директор/менеджер глубины 1); insert — участники; update/delete — нет (append-only, answered_at ставит триггер).
- **task_reads**: только свои строки — select/insert/update по `user_id = auth.uid()`, `company_id` сверяется с `auth_company_id()`; delete — нет (каскад от задачи).
- **point_transactions**: select — свои + director; insert — director только `source='manual'`; всё авто/магазинное — service role или security-definer-функции. Рейтинг клиентом из сырых транзакций НЕ читается — только `fn_rating()`.
- **shop_items**: select — все компании; write — director/shopkeeper. **orders**: свои + director/shopkeeper; мутации — только RPC.
- **announcements/acks**: select — компания; insert announcements — director; ack — свой.
- **push_subscriptions, consents, absences (select)**: свои + director; absences insert/update — director.
- **notification_deliveries, ingest_batches, ai_logs, inbox_items**: select — director (inbox_items — ещё автор); insert/update — service role (inbox_items — автор до confirmed).
- **tv_events**: select — `auth_role() in ('tv','director') and company_id = auth_company_id()`. Роль `tv` не видит НИЧЕГО, кроме tv_events (+ вызов tv_summary()). Realtime — Postgres Changes на tv_events под RLS; `tv_control` — private broadcast, публикация только POST /api/tv/control (service role). Никакого anon.
- View и функции клиентским ролям — только `security_invoker` view и перечисленные security-definer-функции; прямых грантов на агрегаты нет.

## Атомарные операции — функции security definer (вызов через rpc())

```sql
confirm_voice_batch(payload jsonb, client_request_id uuid) returns jsonb
-- идемпотентно через ingest_batches (on conflict → вернуть сохранённый result);
-- разворачивает мульти-исполнителя в N задач с общим group_id; пишет diff в ai_logs;
-- вне окна 08:00–21:00 Asia/Aqtobe ставит status='scheduled', scheduled_send_at = ближайшие 08:00 (D-38)

create_shop_order(p_item_id uuid, client_request_id uuid) returns jsonb
-- pg_advisory_xact_lock(hashtext('points:'||auth.uid())) → SUM-баланс ≥ price
-- → select stock for update, stock>0 → insert order(price снапшот) + shop_hold + stock-1
-- страховка: constraint-триггер на point_transactions — после insert shop_hold проверить SUM≥0 по user
-- (только для shop_hold: ручной минус директора уводить баланс в минус вправе, D-12)

cancel_shop_order(p_order_id uuid, client_request_id uuid) returns jsonb
-- права по D-37; shop_release на сумму hold, stock+1, status='cancelled'

set_shop_order_status(p_order_id uuid, p_status order_status, client_request_id uuid) returns jsonb
-- director/shopkeeper: pending→approved, pending|approved→delivered; транзакций не пишет (D-10)

fn_rating(p_from timestamptz, p_to timestamptz)
  returns table (user_id uuid, display_name text, points int, rank int,
                 delta_vs_prev int, on_time_pct numeric)
-- читает company.settings.rating_mode: 'full' — все; 'top5' — топ-5 + строка запрашивающего;
-- is_active=false исключены; без consent — display_name анонимизирован; on_time_pct заложен для D-29

tv_summary(p_guest bool default false) returns jsonb
-- вердикт + 3 числа недели + топ-5; при p_guest — маскированные поля; доступ ролям tv/director
```

Переходы статусов задач — через update под RLS + `trg_task_status_guard`; списания очков — только через перечисленные функции.

## Триггеры

1. `trg_task_status_guard` (before update on tasks) — матрица переходов.
2. `trg_task_status_message` (after update of status) — system-строка в task_messages.
3. `trg_question_answered` — первое сообщение директора в задаче проставляет `meta.answered_at` открытым вопросам этой задачи.
4. `trg_reaction_message` (after insert on reactions) — system-строка meta={kind:'reaction',emoji,message_id}; если директор и emoji='🔥' — point_transaction `reaction_fire` (on conflict do nothing).
5. `trg_points_balance_guard` (constraint trigger) — SUM≥0 после отрицательного insert.
6. `trg_tv_events_*` — денормализация в tv_events c payload_guest при записи.
7. `trg_notify_outbox` — insert в notification_deliveries на событиях (переход в sent, вопрос, pending_review…).
8. `moddatetime` (extension) — updated_at на tasks, orders, shop_items, inbox_items.
9. `trg_profiles_guard` (before update on profiles) — не-директор не меняет `role`, `company_id`, `is_active`, `manager_id`, `streak_*`; service role (auth.uid() null) — без ограничений.
10. `trg_tasks_field_guard` (before update on tasks) — не-директор и не-автор меняет ТОЛЬКО `status`; штампы `accepted_at/completed_at/closed_at` ставит только `trg_task_status_guard` при переходе (клиентское значение игнорируется — защита от фарминга «принял ≤10 мин»). `accepted_at` = первое принятие (переживает rework→accepted).

## Индексы (полный список; ставит миграция, не «агент по вкусу»)

```
tasks (company_id, assignee_id, status);  tasks (company_id, deadline)
  where status in ('sent','accepted','in_progress','rework');       -- скан просрочек
tasks (company_id, status) where status='pending_review';  tasks (group_id);
task_messages (task_id, created_at);  task_messages (company_id, seq desc);
point_transactions (company_id, user_id, created_at);
orders (company_id, status);  reactions (message_id);  profiles (company_id);
recurrence_rules (next_run_at) where is_active;  reminders (remind_at) where not sent;
notification_deliveries (status, created_at) where status='queued';
tv_events (company_id, seq desc);  ai_logs (company_id, created_at);
announcements (company_id, created_at desc);  absences (company_id, user_id, starts_on);
+ unique-индексы из разделов таблиц (rule_code, order_id+source, client_request_id, endpoint)
```

## Storage

Бакеты: `voice`, `photos` (фото в отчётах; в ранних версиях — `reports`), `shop`, `avatars` — **все private**. Конвенция пути: `bucket/{company_id}/{owner_id}/{uuid}.ext`; политики — по сегментам `storage.foldername(name)`: запись — владелец в свою папку, чтение — владелец. Любое чтение чужого файла (директор слушает аудио, ТВ показывает фото) — **только signed URL, выданный сервером** после проверки прав. Загрузка аудио клиентом — напрямую в Storage по signed upload URL (лимит Vercel 4.5 МБ). Retention: аудио — 12 месяцев (pg_cron-чистка voice + обнуление audio_path), транскрипты — вечно.

## pg_cron (расписания в UTC явно; Aqtobe = UTC+5)

| job | cron (UTC) | суть / идемпотентность |
|---|---|---|
| publish_scheduled | `* * * * *` | tasks scheduled→sent при scheduled_send_at≤now(); push только здесь; повторный прогон безвреден (where status='scheduled') |
| recurrence_spawn | `*/5 * * * *` | по next_run_at, в транзакции сдвигает next_run_at — дубликата нет |
| overdue_sweep | `*/15 * * * *` | system-message + штраф `overdue_penalty` (если включён в settings); идемпотентно через unique(task_id,rule_code) on conflict do nothing |
| notify_sweep | `* * * * *` | отправка queued из notification_deliveries, attempts+1, эскалация telegram по таймауту |
| reminders_send | `* * * * *` | where remind_at≤now() and not sent |
| evening_digest | `0 13 * * *` | сводка директору 18:00 Aqtobe |
| streak_recalc | `30 19 * * *` | 00:30 Aqtobe; учитывает absences (заморозка) |
| push_health | `0 5 * * 1` | еженедельный отчёт «у кого канал мёртв» |
| audio_retention | `0 1 1 * *` | чистка voice старше 12 мес |

## Миграции — дисциплина

- Имя: `YYYYMMDDHHMMSS_описание.sql`. **Одна миграция = одна фича.** Правка старых миграций запрещена; откат — новой миграцией.
- В прод — только `supabase migration up` через CI; **`db push` в прод запрещён**. Два проекта (dev+prod), миграции катятся в оба (при флоте инстансов — на весь флот через CI, V-02).

## seed.sql (dev-фикстуры; обязателен для RLS-тестов и Пульса)

Демо-компания «Demo Group» + settings по D-13. pgTAP ставится здесь (`create extension pgtap with schema extensions`), а не миграцией — фреймворк тестов не должен уезжать в прод; `supabase db lint` гонять с `--schema public` (код pgTAP даёт ложные error в схеме `extensions`). Демо-пароль всех аккаунтов `demo1234`, строки `auth.identities` обязательны для входа по паролю; строковые токен-колонки `auth.users` (`confirmation_token`, `recovery_token`, `email_change*`, `phone_change*`, `reauthentication_token`) сидятся `''` — с NULL GoTrue отвечает 500 на любой вход. 9 профилей: director, manager, shopkeeper, служебный tv, 4 employee и тестовый director «ТЕСТ» (`test@demo.local` / `1`, только dev) — с алиасами-коллизиями: **«Ерлан Байжанов» (aliases: Ерлан, Ерлан Б.) и «Ерлан Досов» (aliases: Ерлан, Ерлан Д.)** — фикстура матчера; «Айгуль» в отпуске (absence + availability). Задачи во **всех** статусах enum (включая scheduled, revoked, rework; в `sent` — две, они же group_id-пара: одна для теста принятия, вторая для отзыва), один открытый вопрос, одна просрочка. Транзакции очков всех source; 2 товара; **1 заказ в pending с активным hold**. Согласия consents: у одного сотрудника отсутствует (проверка анонимизации).

## RLS-тесты (pgTAP, `supabase/tests/`, запуск `supabase test db`)

| # | кейс | ожидание |
|---|---|---|
| 1 | employee читает чужую task | 0 строк |
| 2 | employee insert в point_transactions | ошибка RLS |
| 3 | employee не видит task в status='scheduled' | 0 строк |
| 4 | manager читает задачу прямого подчинённого | видит |
| 5 | manager читает задачу чужой группы | 0 строк |
| 6 | tv читает tv_events своей компании | видит; tasks/profiles/points — 0/ошибка |
| 7 | anon любая таблица | 0 строк |
| 8 | двойной create_shop_order при балансе на один | второй падает (advisory lock + SUM≥0) |
| 9 | повторный confirm_voice_batch с тем же client_request_id | тот же result, без новых задач |
| 10 | повторный overdue_sweep по той же задаче | одна транзакция штрафа |
| 11 | employee отменяет свой pending-заказ / чужой | ок / ошибка |
| 12 | fn_rating при rating_mode='top5' от employee | ≤5 строк + своя |
