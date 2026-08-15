# BACKEND.md — контракт бэкенда Pulse

Что это: контракт серверного слоя Pulse (route handlers, RPC, подсистема доставки, cron, env) — для агентов, реализующих бэкенд. **Арбитр — `DECISIONS.md`.** Схема БД — `docs/DATABASE.md`. Промпты/evals — `docs/AI.md`. Провижининг инстансов — `docs/SETUP.md`.

Бэкенд = Next.js route handlers (`/app/api/*`) + Supabase Edge Functions (webhooks, cron, доставка). Service role key — только на сервере.

## 0. Незыблемые правила слоя

1. **Атомарность.** Любая многотабличная операция — ТОЛЬКО Postgres-функция `security definer` в миграции, через `supabase.rpc()` (supabase-js транзакций не умеет). Route handler = auth → zod-валидация → вызов RPC → маппинг ошибки.
2. **Идемпотентность.** `client_request_id uuid` (генерирует клиент, переживает ретраи) обязателен на ВСЕХ мутирующих эндпоинтах. Регистр — `ingest_batches` (`unique(company_id, client_request_id)`, `insert ... on conflict do nothing`); при дубле RPC возвращает сохранённый `result` (те же id), ничего не создавая.
3. **Переходы статусов задач — только через RPC**, никаких `update tasks set status=...` из клиента.
4. **Формат ошибки** (все эндпоинты): `{ "error": { "code": "snake_case", "message_ru": "текст пользователю" } }`. Коды перечислены в §9.
5. **SaaS V-02:** одна БД = один клиент (изолированный инстанс), код клиент-агностичен — никаких ветвлений «если клиент X»; все настраиваемые числа и клиентский брендинг (D-44) — в `company.settings` или env. `company_id`+RLS сохраняются как защита ролей внутри компании и страховка; кросс-клиентской логики не существует. Провижининг скриптован (см. `docs/SETUP.md`).

## 1. Auth и модель проверки прав (D-06)

Флоу входа: админ создаёт профиль → одноразовый QR-инвайт (очный онбординг) → сотрудник ставит PIN; логин = телефон + PIN. На странице инвайта — детект in-app-браузера с инструкцией «открой в Safari/Chrome» (иначе PWA не установится).

`lib/auth.ts`:

```ts
getSessionProfile(): Promise<{ userId, companyId, role, isActive }> // 401 если нет сессии
requireRole(profile, ...roles: Role[]): void                        // 403 если роль не входит
```

Каждый handler начинается с этих двух вызовов. Роли: `director | employee | shopkeeper | manager | tv`.

### Таблица «эндпоинт → роль → rate limit»

| Эндпоинт | Метод | Роль | Rate limit (в час, из `company.settings.limits`) |
|---|---|---|---|
| `/api/voice/upload-url` | POST | любая активная | как transcribe |
| `/api/voice/transcribe` | POST | director (`context='director_input'`), любая (`context='task_message'`) | director 30, employee 10 |
| `/api/voice/parse` | POST | director | 30 |
| `/api/voice/confirm` | POST | director | — |
| `/api/voice/query` | POST | director | 20 |
| `/api/tasks/:id/revoke` | POST | director | — |
| `/api/points` | POST | director | — |
| `/api/reactions` | POST | любая | 60 |
| `/api/shop/order` | POST | любая | — |
| `/api/shop/order/:id/(approve\|deliver\|cancel)` | POST | director, shopkeeper; `cancel` в `pending` — также владелец заказа (D-37) | — |
| `/api/tv/control` | POST | director | — |
| `/api/push/subscribe` | POST | любая | — |
| `/api/push/ack` | POST | любая | — |
| `/api/telegram/link-code` | POST | любая | — |
| `/api/health` | GET | публичный | — |

Превышение лимита → `429 {error:{code:'rate_limited', message_ru:'Слишком много запросов, попробуй через несколько минут'}}`. Счётчики — по `(user_id, endpoint, hour)` в Postgres.

## 2. Голосовой конвейер

Метрика (D-43): **p50 ≤ 6 с / p90 ≤ 10 с** от отпускания кнопки до интерактивного `/confirm`. Достигается стримингом чанков (MediaRecorder timeslice) в Storage во время записи — к отпусканию кнопки аудио уже на сервере. Латентность по этапам пишется в `ai_logs`.

### POST /api/voice/upload-url
Вход: `{ ext: 'webm'|'m4a'|'mp4', context: 'director_input'|'task_message' }`.
Выход: `{ audio_path, signed_url, token }`. Путь строго `voice/{company_id}/{user_id}/{uuid}.{ext}`. Клиент грузит НАПРЯМУЮ в Storage по signed upload URL — лимит тела Vercel 4.5 МБ не участвует. Политики бакета — по сегментам пути (DATABASE.md).

### POST /api/voice/transcribe
`export const maxDuration = 60`.
Вход: `{ audio_path, context: 'director_input'|'task_message', client_request_id }`. Аудио уже в Storage — тело запроса без бинарных данных.
Выход: `{ transcript, audio_path, stt_provider, latency_ms }`.

STT — только через интерфейс `lib/ai/stt.ts`:

```ts
transcribe(audio: Blob|Stream, opts: { language?: string, vocabularyHints: string[] }): Promise<{ text, provider }>
```

Primary — `gpt-4o-transcribe` с prompt-ростером имён/алиасов сотрудников из БД (`vocabularyHints`). Fallback-провайдер — по env `STT_PROVIDER`; авто-фолбэк при 5xx/timeout primary. Таймаут вызова 30 с, backoff 1 с/3 с, максимум 1 ретрай внутри запроса; дальше — `502 stt_failed`, ретрай с фронта по сохранённому `audio_path` (без перезаписи).

`context='task_message'` (голосовые сотрудников): тот же transcribe, БЕЗ парсинга; результат — в `task_messages(type='voice', content=transcript, file_url=audio_path)`.

### POST /api/voice/parse
Вход: `{ transcript, audio_path?, source: 'voice'|'typed'|'shared', client_request_id }`. Текст и Web Share Target идут сюда же — один парсер на все входы.

Модель `claude-haiku-4-5`, **structured outputs** (`json_schema`, `additionalProperties: false`) — невалидный JSON исключён схемой, **repair-retry не существует**. Промпт, few-shot, конвенции времени (D-15) и evals — в `docs/AI.md`, здесь только контракт выхода:

```jsonc
{ "entities": [
  { "kind": "task",
    "assignee_queries": ["Ерлан","Марат"],      // «Ерлану и Марату» → N задач-копий c общим group_id (D-02)
    "assignee_id": null, "assignee_confidence": 0.0,  // проставляет matchName, не модель
    "title": "...", "body": "...",
    "deadline_iso": "2026-08-15T13:00:00+05:00",      // всегда +05:00
    "deadline_confidence": 0.9, "deadline_source_text": "до обеда",
    "priority": "high", "scheduled_send_at": null,
    "source_span": [12, 87] },                        // срез транскрипта — подсветка на /confirm
  { "kind": "announcement", "text": "...", "source_span": [0,11] },
  { "kind": "points", "assignee_queries": ["Ерлан"], "amount": 10, "reason": "...", "source_span": [...] },
  { "kind": "reminder", "text": "...", "remind_at_iso": "...", "source_span": [...] },
  { "kind": "recurrence", "assignee_queries": ["Айгуль"], "title": "...", "rrule": "FREQ=WEEKLY;BYDAY=MO", "source_span": [...] },
  { "kind": "query", "text": "что там у Ерлана?", "source_span": [...] }   // вопрос — фронт зовёт /api/voice/query
]}
```

`kind:"query"` — маршрутизация «вопрос vs команда» одним входом: директор режим не выбирает. Ничего не выдумывать: нет исполнителя/дедлайна → `null`. Матчинг имён — `lib/matchName.ts` (пороги D-16, в конфиге). `source='shared'`: автоотправка запрещена, `kind='points'` запрещён (D-36, anti-prompt-injection). Снятие очков голосом запрещено (D-30) — `amount<0` из парсера отбрасывается.

### POST /api/voice/confirm
Вход: `{ client_request_id, source, audio_path?, transcript, parsed_entities, confirmed_entities, scheduled_send_at? }`.
Handler: auth → zod → `rpc('confirm_voice_batch', { payload, client_request_id })`.

`confirm_voice_batch(payload jsonb, client_request_id uuid) returns jsonb` (security definer):
1. `insert into ingest_batches ... on conflict (company_id, client_request_id) do nothing`; при конфликте — вернуть сохранённый `result`.
2. В одной транзакции: insert `tasks` (N копий с `group_id`) / `announcements` / `point_transactions` / `reminders` / `recurrence_rules`. Задачи с `scheduled_send_at` → статус `scheduled`; тихие часы (D-38): вне окна 08:00–21:00 Asia/Aqtobe → авто-`scheduled_send_at = ближайшие 08:00` (фронт показывает «отправлю утром», override «отправить сейчас» — явный флаг `force_now`).
3. Триггеры БД вставляют строки в `notification_deliveries` (см. §4) — HTTP из транзакции не зовётся.
4. Записать `result` (id созданных сущностей) в `ingest_batches` и diff `parsed vs confirmed` (`edited`, `edit_fields[]`) в `ai_logs` — это метрика «доля правок» (D-35).
Выход: `{ result: { task_ids[], announcement_ids[], ... }, duplicate: boolean }`.

### POST /api/voice/query
`export const maxDuration = 60`. Только director (D-34). Модель Sonnet-класса, tool use со `strict: true`.

- 5–8 инструментов: `search_tasks(query, assignee_id?, status?)`, `employee_tasks(user_id)`, `overdue_list()`, `who_not_reported(period)`, `summary_today()`, `employee_score(user_id)`. Параметр-исполнитель — только валидный `user_id` (enum из ростера в схеме инструмента), не свободная строка.
- Правило промпта: **факты — только из tool results**; нет данных → «не нашёл», не сочинять.
- Максимум 4 итерации tool-цикла, общий таймаут 15 с, жёсткий `max_tokens`.
- Tool-обёртки выполняются под RLS-контекстом директора (клиент с его JWT), НЕ service role.
- Ответ: короткий текст + **карточки, которые рендерит бэкенд из tool results** (типизированный JSON `{type:'task_list'|'employee'|'summary', items:[...]}`), модель карточки не сочиняет.
- Стриминг: ручной SSE через `@anthropic-ai/sdk` (events: `text_delta`, `cards`, `done`, `error`). **Vercel AI SDK в стек не вносить** (G.6).

## 3. RPC-функции (контракт транзакций)

Все — `security definer`, в миграциях, проверяют роль вызывающего через `auth_role()`/`auth_company_id()`, все мутирующие принимают `client_request_id` и идемпотентны через `ingest_batches`.

| Функция | Сигнатура | Поведение |
|---|---|---|
| `confirm_voice_batch` | `(payload jsonb, client_request_id uuid) → jsonb` | §2 |
| `create_shop_order` | `(item_id uuid, client_request_id uuid) → jsonb` | Баланс `SUM(point_transactions) ≥ price` и `stock > 0` с `select ... for update` + advisory lock на user; insert order(`pending`) + `point_transactions(shop_hold, −price)` + декремент stock. Ошибки: `insufficient_points`, `out_of_stock` |
| `cancel_shop_order` | `(order_id uuid, client_request_id uuid) → jsonb` | Владелец — только из `pending` (D-37); director/shopkeeper — из `pending/approved`. `point_transactions(shop_release, +price)` + возврат stock. Выдача (deliver): hold остаётся финальным, `shop_final` не существует (D-10) |
| `revoke_task` | `(task_id uuid, client_request_id uuid) → jsonb` | D-01: любой статус до `done` → `revoked`; у сотрудника карточка «отозвано директором». `scheduled` до отправки — физический delete (никому не доставлена) |
| `transition_task` | `(task_id uuid, to_status task_status, payload jsonb, client_request_id uuid) → jsonb` | Единая точка переходов; валидирует матрицу §7 по роли; ошибка `invalid_transition` |
| `apply_auto_rule` | `(task_id uuid, rule_code text) → void` | Вызывается только cron/триггерами; идемпотентна partial-unique `(task_id, rule_code)` — повторный done после rework бонуса не даёт (D-31) |

## 4. Подсистема доставки уведомлений — продуктовая фича №1

«Директор видит, кто не увидел поручение» — это SELECT по этой подсистеме, а не инфраструктурная деталь.

### Outbox
Таблица `notification_deliveries` (схема в DATABASE.md): `status enum('queued','sent','failed')`, `channel enum('push','telegram','sms')`, `attempts`, `last_error`, `tier`, `sent_at`, `seen_at`, `acted_at`.

- **Триггер БД вставляет строку `queued` — и НИКОГДА не зовёт HTTP.** Push-триггер задач срабатывает только на переход `scheduled/insert → sent`.
- `pg_net` — только «пинок» Edge Function `send-push` (fire-and-forget допустим, потому что есть свип).
- Страховка: pg_cron-свип каждую минуту — зависшие `queued`/`failed` c `attempts < 3` переотправляются.
- Edge Function `send-push`: читает пачку queued → web-push → `sent`/`failed(attempts+1, last_error)`.

### Ack-семантика (D-32)
«Увидел» = SW шлёт `POST /api/push/ack {delivery_id}` при показе нотификации, ЛИБО открытие приложения (любой авторизованный запрос пользователя закрывает его недавние `sent` → `seen_at`). Статусы директору: **«отправлено / увидел / принял»**; формулировка индикатора — «не открывал с 9:14», никогда «не получил» (Web Push не подтверждает доставку).

### Эскалация (ярусы)
1. **Ярус 1 — push.** Ошибка отправки (5xx, нет подписок) → Telegram немедленно.
2. **Ярус 2 — Telegram.** Нет `seen_at` за N минут (`company.settings.escalation_minutes`, default 10) в рабочие часы → Telegram-дубль с inline-кнопками «Принял / Вопрос».
3. **Ярус 3 — SMS (D-41):** канал в enum и интерфейс `DeliveryChannel { send(delivery): Promise<Result> }` заложены, реализация НЕ строится в v1.

**Дедупликация:** ярус N+1 стреляет только если ярус N не подтверждён (`seen_at is null`) по таймауту — иначе сотрудники замьютят бота.

### Гигиена канала
- Чистка подписок: `410`/`404`/`NotRegistered` → delete endpoint немедленно.
- Еженедельный health-check: тихий пинг всех подписок → отчёт директору/админу «у кого канал мёртв».
- Тихие часы 08:00–21:00 Asia/Aqtobe (D-38, `company.settings.delivery_window`): вне окна доставка не выполняется, контент — авто-`scheduled` на 08:00.

### Матрица нотификаций

| Событие | Получатель | Текст (шаблон) | Deep-link | Канал |
|---|---|---|---|---|
| Задача → `sent` | исполнитель | «Новая задача: {title}» | `/tasks/{id}` | push → tg (эскалация) |
| Объявление | все активные | «Объявление: {text…}» | `/feed` | push (без эскалации) |
| Реакция директора | сотрудник | «{emoji} на твой отчёт» | `/tasks/{id}` | push |
| Очки | сотрудник | «+{n} очков: {reason}» | `/feed` | push |
| Заказ выдан | сотрудник | «Твой заказ готов: {item}» | `/shop/orders` | push |
| `rework` | исполнитель | «Доработка: {title}» | `/tasks/{id}` | push → tg |
| Вопрос сотрудника | директор | «Вопрос от {name}: {text…}» | `/tasks/{id}` | push |

## 5. Telegram

- **Привязка — обязательный шаг онбординга** (D-21): PWA зовёт `POST /api/telegram/link-code` → one-time code (TTL 15 мин) → deep-link `https://t.me/<bot>?start=<code>`. Edge Function `tg-webhook` на `/start` сопоставляет code → user_id, пишет `telegram_chat_id`.
- `tg-webhook` сверяет заголовок `X-Telegram-Bot-Api-Secret-Token` с `TELEGRAM_WEBHOOK_SECRET`; несовпадение → 401 без обработки.
- Inline-кнопки «Принял / Вопрос» → callback → `transition_task` / сообщение в канал задачи; статус пишется в БД, `acted_at` в delivery.
- Бот — grammY; dev-среда использует ОТДЕЛЬНОГО тестового бота.

## 6. Очки, реакции, магазин

- `POST /api/points` — director; `amount ≠ 0`, `reason` обязателен при `amount < 0`; вставка через RPC (advisory lock на user при списаниях).
- **Автоштрафы выключены весь калибровочный месяц** (`company.settings.auto_penalties_enabled=false` — default, D-28); после включения применяются только к дедлайнам с высоким `deadline_confidence` или правленным директором вручную. Идемпотентно по `(task_id, rule_code)`.
- `POST /api/reactions` — insert + delivery; emoji из `company.settings.reaction_points` → `point_transactions(source='reaction')`.
- Магазин — только RPC `create_shop_order`/`cancel_shop_order` (§3). Баланс всегда = `SUM(point_transactions)`, нигде не хранится.

## 7. Статусная машина задач

`scheduled → sent → accepted → pending_review → done | rework(→accepted) | declined | revoked`. `in_progress` в enum остаётся, в v1 не используется (D-04). «Уточнить» — не статус: `meta.is_question` на сообщении + `meta.answered_at` триггером при первом ответе директора (G.7).

| Переход | Кто |
|---|---|
| `scheduled → sent` | cron `scheduled-send` |
| `sent → accepted` | исполнитель («Принял», в т.ч. из Telegram) |
| `sent/accepted → declined` | исполнитель (причина обязательна) |
| `accepted → pending_review` | исполнитель (отчёт) |
| `pending_review → done \| rework` | только director |
| `rework → accepted` | исполнитель |
| `любой до done → revoked` | director (`revoke_task`) |
| `scheduled → (delete)` | director, до отправки |

Всё остальное — `409 invalid_transition`.

## 8. ТВ-режим

- Киоск — **auth-пользователь роли `tv`** (не anon), RLS-доступ только к `tv_events` (предмаскированный `payload_guest`) и событийным view. Логин на устройстве один раз.
- Канал `tv_control:{company_id}` — **private broadcast**; подписка — участники компании, публикация — только service role.
- **Публикация ТОЛЬКО через `POST /api/tv/control`** (role=director): `{ mode:'ether'|'employee_focus'|'task_focus'|'week_summary'|'compare', employee_id?, task_id?, guest: boolean }`.
- Guest-режим — состояние канала `tv_control` (кнопка в пульте директора, D-33), НЕ query-параметр; `?guest=1` — лишь стартовое значение до первой команды.
- Авто-возврат в `ether` через 10 мин без команд — таймер на клиенте ТВ. Heartbeat киоска → `/api/health` (индикация «ТВ завис»).

## 9. Контракт ошибок AI-конвейера (для фронта)

| Состояние | HTTP | JSON | Поведение фронта |
|---|---|---|---|
| upload-fail | — (Storage напрямую) | ошибка signed-URL upload | ретрай загрузки; аудио остаётся в IndexedDB-очереди |
| stt-fail | 502 | `{error:{code:'stt_failed'}, audio_path}` | «Не расслышал» + ретрай по сохранённому `audio_path`, без перезаписи |
| empty-entities | 200 | `{entities:[]}` | показать сырой транскрипт + «Повторить / отправить как текст» |
| refused (отказ модели) | 422 | `{error:{code:'parse_refused'}, transcript}` | сырой транскрипт + ручной ввод |
| timeout (STT/parse/query) | 504 | `{error:{code:'ai_timeout'}, audio_path?}` | ретрай с фронта |
| low-confidence | 200 | `assignee_confidence`/`deadline_confidence` ниже порога | не ошибка: жёлтый/красный чип, отправка сущности с нераспознанным исполнителем заблокирована (D-16/D-36) |
| rate_limited | 429 | `{error:{code:'rate_limited', message_ru}}` | показать текст, disable кнопки на минуту |
| duplicate confirm | 200 | `{result, duplicate:true}` | обычный success (те же id) |

## 10. Cron и Edge Functions

Все Edge Functions, вызываемые из `pg_net`, требуют заголовок `x-internal-secret` = `INTERNAL_FN_SECRET`; иначе 401. Vercel cron — `CRON_SECRET`.

| Функция | Расписание | Делает |
|---|---|---|
| `send-push` | пинок pg_net + свип 1 мин | разбор outbox §4 |
| `deliveries-escalate` | 5 мин | эскалация ярусов §4 |
| `scheduled-send` | 1 мин | `scheduled → sent` по `scheduled_send_at <= now()` |
| `recurrence-runner` | 15 мин | сдвиг `next_run_at` + insert задачи одной SQL-функцией (без дублей при перекрытии прогонов) |
| `overdue-checker` | 15 мин | пометка просрочек + `apply_auto_rule` + system-сообщение |
| `daily-summary` | 18:00 | сводка дня директору |
| `push-healthcheck` | еженедельно | тихий пинг подписок, отчёт §4 |
| `audio-cleanup` | ежедневно | аудио старше 12 мес — удалить; транскрипты вечно (D-18) |

## 11. Environments (D-19)

Два проекта Supabase: **dev** (free tier) и **prod**. Vercel: preview → dev, production → prod. Миграции: локально → `supabase db push` в dev → в prod только из CI/main. Отдельные VAPID-пары и отдельный тестовый Telegram-бот на dev. **Смена VAPID-ключей = мгновенная смерть всех push-подписок** — prod-пару не трогать никогда без плана ре-подписки.

| Переменная | Где | Примечание |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | по средам |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server), Supabase secrets | никогда в клиенте |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Vercel | |
| `STT_PROVIDER` + ключ fallback-провайдера | Vercel | `gpt4o\|elevenlabs\|deepgram` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Vercel | отдельные пары dev/prod |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | Supabase secrets | отдельный бот на dev |
| `INTERNAL_FN_SECRET` | Supabase secrets + БД-настройка для pg_net | §10 |
| `CRON_SECRET` | Vercel | |
| `SENTRY_DSN` | Vercel + Supabase | §12 |

## 12. Наблюдаемость

- **Sentry** во всех route handlers и Edge Functions.
- Алерты: рост `failed` в `notification_deliveries`; `status='error'` в `ai_logs`. Соло-разработчик не должен узнавать о падении пушей от директора.
- `ai_logs` (схема в DATABASE.md): все AI-вызовы — модель, латентность по этапам, **input/output tokens и стоимость**, tool_calls, `parsed/confirmed_entities` + diff правок, `source`, `client_request_id`. Аудио в логи не пишется.
- `/api/health` — liveness + heartbeat ТВ.
