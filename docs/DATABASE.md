# DATABASE.md — схема Supabase / Postgres

Единственный источник правды по схеме — миграции в `/supabase/migrations`. Этот документ — проектный контракт: создавай миграции по нему.

## Общие правила

- Везде `company_id uuid not null` (SaaS-ready) + индекс. RLS фильтрует по company_id и роли.
- `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`.
- Enum-типы через `create type`. Статусы задач не расширять.
- RLS включается в той же миграции, где создаётся таблица. Deny by default.

## Таблицы

### companies
`id, name, settings jsonb` — settings: правила авто-очков, публичность рейтинга (full|top5), реакция→очки map, курс очков.

### users (расширение auth.users через profiles)
```
profiles: id (fk auth.users), company_id, full_name, role enum('director','manager','employee','shopkeeper'),
position text, avatar_url, aliases text[]   -- «Ерлан», «Ерлан Б.» для голосового матчинга
manager_id uuid null                        -- для делегирования деревом
telegram_chat_id bigint null                -- fallback-канал
```

### tasks
```
id, company_id, author_id, assignee_id, parent_task_id uuid null,  -- подзадачи при делегировании
title text, body text, deadline timestamptz, priority enum('low','normal','high'),
status enum('sent','accepted','in_progress','pending_review','done','rework','declined'),
source_audio_url text null, source_transcript text null,           -- оригинал голосового
scheduled_send_at timestamptz null,                                -- отложенная отправка
recurrence_rule_id uuid null,
accepted_at timestamptz, completed_at timestamptz, closed_at timestamptz
```
Индексы: (company_id, assignee_id, status), (company_id, deadline), partial по status='sent'.

### task_messages  ← «лента общения», ядро событийной модели
```
id, company_id, task_id, sender_id,
type enum('text','voice','photo','status_change','reaction_ref','system'),
content text,            -- текст или транскрипт голосового
file_url text null,      -- Storage: аудио/фото
meta jsonb               -- {old_status,new_status} для status_change и т.п.
```
Всё, что происходит с задачей — строка здесь. Дашборд и ТВ-лента читают отсюда.

### announcements (Эфир)
`id, company_id, author_id, audio_url, transcript, created_at`
### announcement_acks
`announcement_id, user_id, created_at` — «Принял к сведению», PK (announcement_id, user_id).

### point_transactions  ← append-only, баланс = SUM(amount)
```
id, company_id, user_id, amount int,             -- отрицательное = списание/штраф
reason text not null,
source enum('manual','auto_rule','reaction','shop_hold','shop_release','shop_final'),
task_id uuid null, order_id uuid null, actor_id uuid null, created_at
```
Заморозка магазина: заказ → `shop_hold` (−price); отмена → `shop_release` (+price); выдача → hold остаётся финальным (или пара release+final — выбери один паттерн и зафиксируй в миграции комментарием).

### reactions
`id, company_id, message_id fk task_messages, author_id, emoji text` — уникальность (message_id, author_id).

### shop_items
`id, company_id, title, photo_url, price int, stock int, is_active bool`
### orders
`id, company_id, user_id, item_id, status enum('pending','approved','delivered','cancelled'), created_at, delivered_at`

### push_subscriptions
`id, user_id, endpoint text unique, p256dh, auth, created_at`

### recurrence_rules
`id, company_id, author_id, assignee_id, title, body, priority, rrule text, is_active bool, next_run_at` — исполняется pg_cron.

### reminders (напоминания директора самому себе)
`id, company_id, user_id, text, remind_at, sent bool`

## Представления и агрегаты

- `mv_pulse_summary` (materialized view): агрегаты для блока «Статус» и «Цифры недели» — % в срок, среднее время реакции (accepted_at − created_at), счётчики по статусам, по сотрудникам. Refresh: pg_cron каждые 5 минут + `refresh ... concurrently` по триггерной функции на критичных событиях (просрочка, pending_review).
- `v_rating_period(period)` или mv по неделе/месяцу: SUM(points) group by user + rank + динамика к прошлому периоду.
- `v_employee_load`: активные задачи по сотруднику + цвет состояния (правило: red = есть просрочка, yellow = дедлайн < 24ч, green = есть задачи в срок, gray = нет активных).

## RLS (принципы)

- profiles: читают все внутри company_id; пишет владелец + director.
- tasks / task_messages: assignee видит только свои (assignee_id = auth.uid() или author_id = auth.uid()); director/manager — по роли (manager — только своё поддерево manager_id). Insert task_messages — участники задачи.
- point_transactions: свои читает каждый; insert — только director (manual) и service role (auto/shop).
- shop_items: читают все; пишут director/shopkeeper. orders: свои + director/shopkeeper.
- announcements: читают все в компании; пишет director.
- ТВ-режим работает через отдельный ограниченный token/anon-роль с доступом только к событийным view (без ПД сверх нужного; гостевой режим — view без фамилий).

## Storage-бакеты

`voice` (аудио директора и сотрудников), `reports` (фото-отчёты), `shop` (фото товаров), `avatars`. Политики зеркалят RLS задач.

## pg_cron задания

1. refresh mv_pulse_summary — */5 min.
2. recurrence_rules → создание задач по next_run_at — каждый час... нет, каждые 5 минут (дёшево).
3. Отложенные задачи: publish tasks where scheduled_send_at <= now() and status is null/draft.
4. Вечерняя сводка директору — 18:00 Asia/Aqtobe.
5. Напоминания reminders.
6. Просрочки: пометка + авто-штраф −5 (если правило включено в company.settings) — раз в 15 минут, идемпотентно (проверять, что транзакция за эту просрочку ещё не создана).
