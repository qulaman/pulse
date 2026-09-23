# BACKEND.md — контракт бэкенда Pulse

Что это: контракт серверного слоя Pulse (route handlers, RPC, подсистема доставки, минутный тик, env) — для агентов, реализующих бэкенд. **Арбитр — `DECISIONS.md`, читать с раздела «Сейчас действует».** Схема БД — `docs/DATABASE.md`. Промпты/evals — `docs/AI.md`. Провижининг инстансов — `docs/SETUP.md`.

Метки: `[есть]`, `[за флагом: settings.<ключ>]`, `[не построено]`. Раздел без метки описывает то, что есть в коде; план всегда помечен.

Бэкенд = Next.js route handlers (`/app/api/*`) + Postgres-функции (RPC) в миграциях + один минутный Vercel cron (`vercel.json` → `/api/push/sweep`, §10). Supabase Edge Functions, pg_cron и pg_net не подключены (папки `supabase/functions` нет, G.20c). Service role key — только на сервере.

## 0. Незыблемые правила слоя

1. **Атомарность.** Любая многотабличная операция — ТОЛЬКО Postgres-функция `security definer` в миграции, через `supabase.rpc()` (supabase-js транзакций не умеет). Route handler = auth → zod-валидация → вызов RPC → маппинг ошибки. Многие RPC клиент зовёт напрямую под своим JWT, без роута-обёртки (§3).
2. **Идемпотентность.** `client_request_id uuid` (генерирует клиент, переживает ретраи) обязателен на ВСЕХ мутирующих эндпоинтах. Регистр — `ingest_batches` (`unique(company_id, client_request_id)`, `insert ... on conflict do nothing`); при дубле RPC возвращает сохранённый `result` (те же id), ничего не создавая. Исключения по решению — абсолютное состояние, повтор безвреден: `tv_control` (D-76 §3), `respond_event` (D-78 §6). Без ключа в коде также функции из §3 с пометкой «без `client_request_id`».
3. **Переходы статусов задач — только через RPC**, никаких `update tasks set status=...` из клиента.
4. **Формат ошибки** (все эндпоинты): `{ "error": { "code": "snake_case", "message_ru": "текст пользователю" } }`, доп. поля (`audio_path`, `transcript`) — рядом с `error` (`lib/api/respond.ts`). Коды AI-конвейера — §9.
5. **SaaS V-02:** одна БД = один клиент (изолированный инстанс), код клиент-агностичен — никаких ветвлений «если клиент X»; все настраиваемые числа и клиентский брендинг (D-44) — в `company.settings` или env. `company_id`+RLS сохраняются как защита ролей внутри компании и страховка; кросс-клиентской логики не существует. Провижининг скриптован (см. `docs/SETUP.md`).

## 1. Auth и модель проверки прав

Вход — email + пароль Supabase Auth (G.21). Продуктовый флоу D-06 (QR-инвайт, PIN, логин по телефону, детект in-app-браузера) — `[не построено]`, D-06 🔴. Людей заводит директор (`POST /api/people`); пароль сотруднику задаёт директор на карточке (`/api/people/:id/password`), свой сотрудник меняет в профиле через `auth.updateUser` (G.20b).

`lib/auth.ts`:

```ts
getSessionProfile(req?): Promise<{ userId, companyId, role, isActive, fullName }> // Bearer-токен или cookies; 401 unauthorized, 403 inactive
requireRole(profile, ...roles: Role[]): void                                      // 403 forbidden
```

`lib/api/handler.ts` — обёртка всех роутов:

```ts
withAuth(roles: Role[] | 'any', fn, schema?)   // auth → zod тела (400 validation_error) → fn; прочие исключения → 500 internal
userSupabase(req)                              // клиент с JWT вызывающего: RPC идут под его ролью и RLS
```

`'any'` = любой активный профиль. Без `withAuth`: `/api/company/logo` (multipart; те же `getSessionProfile` + `requireRole`), `/api/me`, `/api/health`, `/api/push/sweep` (секрет cron). Роли: `director | manager | employee | shopkeeper | secretary | tv` (`secretary` — D-79).

Лимитов частоты запросов нет `[не построено]`: ни `company.settings.limits`, ни счётчиков в БД.

### Таблица «эндпоинт → роль»

| Эндпоинт | Метод | Роль | Что |
|---|---|---|---|
| `/api/voice/upload-url` | POST | любая | `{ext: webm\|m4a\|mp4, context: director_input\|task_message, client_request_id}` → signed upload URL в бакет `voice`; для `director_input` — строка `inbox_items` (§2) |
| `/api/voice/transcribe` | POST | director | §2 |
| `/api/voice/parse` | POST | director | §2 |
| `/api/voice/confirm` | POST | director | §2 |
| `/api/voice/audio-url` | GET | любая | `?path=` → signed URL оригинала на 10 мин; доступ решает RLS: путь должен быть `source_audio_path` видимой задачи или `audio_path` объявления |
| `/api/voice/query` | — | — | `[не построено, этап 3]` (§2) |
| `/api/tasks/:id/transition` | POST | любая (право перехода проверяет `trg_task_status_guard`) | `{to_status, reason?, comment?, report?: {text?, file_path?}, client_request_id}` → `transition_task`; при `accepted` закрывает квитанцию `task_sent` (`acted_at`, D-32) |
| `/api/tasks/:id/revoke` | POST | director | `{client_request_id}` → `revoke_task` (D-01) |
| `/api/tasks/:id/deadline` | POST | director | `{deadline_iso \| null, client_request_id}` → `extend_task_deadline` («Продлить», D-51 п.3) |
| `/api/tasks/:id/reassign` | POST | director | `{assignee_id, client_request_id}` → `reassign_task` (D-80 §5) |
| `/api/tasks/:id/delete` | POST | director | → `delete_task` (D-58) |
| `/api/tasks/purge` | POST | director | → `purge_closed_tasks` (D-58) |
| `/api/admin/reset-demo` | POST | director + `DEMO_RESET_ENABLED=1` на инстансе | `{confirm: "ОБНУЛИТЬ"}`; активность компании стирается, люди и настройки остаются (D-58, G.20a); иначе `403 demo_reset_disabled` |
| `/api/errands` | POST | director | `{kind, note?, client_request_id, audio_path?, source_transcript?, inbox_item_id?}` → вставка `errands` под RLS; `label` берётся из `settings.secretary.actions`, неизвестный код — `400 unknown_kind`; дубль ключа → `{duplicate: true}` (D-79) |
| `/api/visits` | POST | secretary | `{note?, client_request_id}` → RPC `announce_visit`; пуш `visit_arrived` директорам сразу (D-96) |
| `/api/visits/:id/answer` | POST | director | `{answer: 'invited' \| 'wait' \| 'declined'}` → RPC `answer_visit`; «invited» включает гостя на час; пуш `visit_answered` автору сразу (D-96) |
| магазин | — | — | роутов нет: клиент зовёт RPC `create_shop_order`, `cancel_shop_order`, `set_shop_order_status` напрямую (D-71); права и идемпотентность — внутри функций. Ассортимент (`shop_items`) директор и завхоз правят upsert'ом под RLS с заранее выданным id |
| `/api/push/subscribe` | POST, DELETE | любая | POST `{endpoint, keys: {p256dh, auth}, user_agent?}`; DELETE `{endpoint}` — своя подписка |
| `/api/push/seen` | POST | любая | «увидел» (D-32): `{delivery_id}` из SW при показе уведомления; без `delivery_id` (открытие приложения) — все незакрытые строки человека |
| `/api/push/acted` | POST | любая | «Прочитал» из шторки (D-64): `{delivery_id}` своей доставки → `mark_thread_read` до `meta.last_seq` под токеном пользователя |
| `/api/push/sweep` | POST | — (`Authorization: Bearer <CRON_SECRET>`) | минутный тик §10 |
| `/api/files/upload-url` | POST | любая | `{ext: jpg\|png\|webp, client_request_id}` → signed upload URL в бакет `photos`, путь `{company}/{user}/{client_request_id}.{ext}` (G.20b) |
| `/api/files/url` | GET | любая | `?message_id=` → signed URL файла сообщения на 10 мин; доступ решает RLS `task_messages`, бакет по типу: `photo` → `photos`, `voice` → `voice`; путь в Storage клиент не называет |
| `/api/people` | POST | director | создаёт auth-пользователя через admin API service role + профиль (роли — весь enum, в т.ч. `secretary`, `tv`); при провале профиля auth-пользователь удаляется; `409 email_exists` |
| `/api/people/:id/password` | POST | director | `{password}` (6–72) через service role; только своя компания, пароль другого директора — `403` (G.20b) |
| `/api/company` | GET, PATCH | director | название (RPC `update_company_profile`) и `settings.brand` (`accent`, `tagline`, `logo_url` через `update_company_settings`), G.20d |
| `/api/company/logo` | POST | director | multipart ≤2 МБ, PNG/JPEG/WebP/SVG → публичный бакет `brand/{company}/logo-*.ext`, URL — в `settings.brand.logo_url` |
| `/api/settings` | GET, PATCH | director | D-48: секции `stt`, `parser`, `vocabulary`, `conventions` (D-15), `matching` (D-16), `points_enabled`, `rating_mode`, `delivery_window`, `secretary` (D-79), `brand`; PATCH дополняет присланную секцию текущими значениями и сливает через RPC `update_company_settings` |
| `/api/lab` | GET, PATCH | любая (D-63, без проверки роли по слову владельца) | GET — последние 400 строк `ai_logs` (stt/parse) с ценой по `lib/ai/pricing.ts`; PATCH — секции `stt`, `parser` service-клиентом |
| `/api/me` | GET | любая сессия | `{profile}` |
| `/api/health` | GET | публичный | liveness `{ok, version, time}`, без БД |

## 2. Голосовой конвейер

Метрика (D-43): **p50 ≤ 6 с / p90 ≤ 10 с** от отпускания кнопки до интерактивных карточек подтверждения (на доске Пульса, D-60; `/confirm` — запасной экран). Голосовое уходит одним blob после отпускания (G.23); стриминг чанков MediaRecorder `timeslice` — `[не построено]`. Латентность по этапам пишется в `ai_logs` (`stt_ms`, `parse_ms`, `latency_ms`).

Без экрана подтверждения сохраняются только заметки (D-75 §4: фраза из одних заметок сразу уходит в `/api/voice/confirm`, тост «Записал» с «Отменить»; диктовка на экране «Заметки» — строкой `notes` под RLS, см. `note_id` ниже) и заявки секретарю (D-79 §9: матчер в `/api/voice/parse` → `/api/errands`).

### POST /api/voice/upload-url
Вход: `{ ext, context: 'director_input'|'task_message', client_request_id }`.
Выход: `{ audio_path, signed_url, token, inbox_id? }`. Путь в бакете `voice` строго `{company_id}/{user_id}/{client_request_id}.{ext}`. Клиент грузит НАПРЯМУЮ в Storage по signed upload URL — лимит тела Vercel 4.5 МБ не участвует. Для `director_input` роут заводит (или находит по `client_request_id`) строку `inbox_items` со статусом `recorded`. Политики бакета — по сегментам пути (DATABASE.md). Объект этого ключа уже в Storage (прошлая загрузка дошла, ответ потерялся) — `{ audio_path, signed_url: '', token: '', stored: true }`, клиент загрузку пропускает и идёт дальше (D-95): повтор не падает навсегда.

### POST /api/voice/transcribe
`export const maxDuration = 60`.
Вход: `{ audio_path, context: 'director_input', client_request_id, duration_ms?, note_id? }`. Аудио уже в Storage — тело запроса без бинарных данных; `audio_path` обязан начинаться с `{company}/{user}/` вызывающего.
Выход: `{ transcript, audio_path, stt_provider, latency_ms, suspicious }`; guard отбраковал не-речь — `200 { transcript: null, code: 'empty_transcript', guard }`, парсер не вызывается (D-52 §1).

STT — только через `lib/ai/stt.ts`:

```ts
transcribe(audio: Buffer, mime: string, opts: { language, vocabularyHints }, providers?, policy?): Promise<{ text, provider, durationMs? }>
```

Провайдеры — из `settings.stt` (`provider` / `fallback`: `openai | whisper1 | deepgram | elevenlabs`, `language: auto | ru`); основной — `gpt-4o-transcribe`, ElevenLabs Scribe — только запасной (D-53). Подсказка — ростер не больше 60 самых адресуемых людей + `settings.vocabulary` (D-55; формат — docs/AI.md). Ретраи — G.18: основной 10 с → запасной 10 с → пауза 1 с → один повтор основного → `502 stt_failed` с `audio_path`; 4xx кроме 408/429 — сразу. Ретрай с фронта — по сохранённому `audio_path`, без перезаписи.

**Голосовые в треде не распознаются (D-66, заменяет D-64 §4)** — роут принимает только `context='director_input'` и только роль директора. Сообщение-голос остаётся звуком: клиент кладёт аудио в Storage по signed URL (`context='task_message'` у upload-url, строка `inbox_items` не заводится) и вставляет `task_messages(type='voice', file_path=audio_path, content=null, meta.duration_ms)`; транскрипта у него нет и не будет.

`context='director_input'` + `note_id` (диктофон «Заметок», D-81): клиент кладёт аудио в Storage, вставляет строку `notes(text='', audio_path, inbox_item_id, client_request_id)` под RLS и зовёт transcribe с её `note_id`; роут дописывает `text` и `raw_transcript` service-клиентом, сузив запись до `user_id` вызывающего и того же `audio_path`, причём `text` — только пока он пустой (директор мог вписать слова руками раньше STT), `raw_transcript` — в любом случае. Парсер не вызывается. STT упал или guard отбраковал — заметка остаётся с голосом без слов, «Распознать» на карточке зовёт transcribe снова.

### POST /api/voice/parse
`export const maxDuration = 60`.
Вход: `{ transcript, audio_path?, source: 'voice'|'typed'|'shared', client_request_id, suspicious?, assignee_id? }`. Текст одной строкой идёт сюда же — один парсер на все входы. Web Share Target — `[не построено]` (D-36); значение `shared` схема принимает.

Порядок:
1. **Идемпотентность:** удачный разбор с тем же `client_request_id` уже есть в `ai_logs` → возвращается он, модель не зовётся.
2. **Матчер заявок до модели (D-79 §9, `lib/errands/matcher.ts`):** при активном секретаре фраза до трёх слов без имени из ростера, совпавшая с `label`/`synonyms` каталога, → `{ entities: [], errand, model: 'matcher' }`; ни токена, ни подтверждения.
3. **Модель** `settings.parser.model` (дефолт `claude-haiku-4-5`), **structured outputs** собственной JSON Schema (G.17) — невалидный JSON исключён схемой, **repair-retry не существует**. Эскалация на `settings.parser.escalation_model` по триггерам G.17, если `settings.parser.escalate`. DeepSeek — только сравнение в «Лаб» (D-63).
4. **Постобработка** (`lib/ai/postprocess.ts`): модель называет исполнителя именем, id ставит сервер (D-56) через `lib/matchName.ts` по порогам `settings.matching` (D-16, D-54); минус очков голосом и очки из `shared` блокируются (D-30, D-36); `suspicious` от transcribe — потолок уверенности исполнителя 0.5 и жёлтый чип.
5. **Закреплённый исполнитель (D-84, `lib/ai/pin.ts`):** `assignee_id` — человек, выбранный до фразы (кружок на экране ожидания, «Дать задачу» на карточке); сервер ставит его всем сущностям с одним исполнителем, кроме той, где модель узнала другое, произнесённое вслух имя.

Выход: `{ entities, model, escalated, latency_ms }`; строка `ai_logs` (`kind='parse'`), `inbox_items` → `parsed`. Ошибки: `422 parse_refused`, `502 parse_failed` (§9). Контракт сущностей — `lib/ai/schema.ts` (`EntitySchema`; модели уходит `ModelEntitySchema`), промпт, few-shot, конвенции времени (D-15) и evals — `docs/AI.md`; копия контракта здесь не ведётся. Ничего не выдумывать: нет исполнителя/дедлайна → `null`.

`kind:'query'` — вопрос к данным: `/api/voice/query` `[не построено]`, ответы на Пульсе детерминированные (D-51 п.4, `lib/pulse/answers.ts`), `confirm_voice_batch` вопрос не сохраняет.

### POST /api/voice/confirm
Вход: `{ client_request_id, source, audio_path?, transcript, parsed_entities, confirmed_entities, force_now?, inbox_id?, note_id? }`.
Handler: auth → zod (служебные поля карточек `assignee`, `participants`, `blocked` срезаются) → `editDiff(parsed, confirmed)` даёт `was_edited` / `edit_fields` (D-35) → `rpc('confirm_voice_batch', { payload, client_request_id })` под JWT директора → `after(kickDeliveries)` (§4).

`confirm_voice_batch(payload jsonb, client_request_id uuid, p_now timestamptz default now()) returns jsonb` (security definer, только director):
1. `insert into ingest_batches ... on conflict do nothing`; при конфликте — сохранённый `result` + `duplicate: true`.
2. В одной транзакции по видам: `task` / `delegation` → `tasks` (N копий с общим `group_id`, D-02; без исполнителя — `assignee_required`); `announcement` → `announcements`; `reminder` → заметка с `remind_at` (D-95; ключ ответа `reminder_ids` — id заметок); `event` → `events` + `event_participants` (автор — `going`, «всем» материализуется составом компании; без времени — `event_time_required`, D-78); `note` → `notes` (D-75); `recurrence` → `recurrence_rules`; `points` → `point_transactions` только при `points_enabled` и сумме > 0, иначе в `skipped` (D-48, D-30); `query` → в `skipped`.
3. Окно доставки (D-38): задача с явным `scheduled_send_at` или вне `settings.delivery_window` (если нет `force_now`) → статус `scheduled` с `scheduled_send_at` = открытие окна. Выпуск `scheduled → sent` — `[не построено]`, наряд 017.
4. Триггеры БД вставляют строки в `notification_deliveries` (§4) — HTTP из транзакции не зовётся.
5. `confirmed_entities`, `was_edited`, `edit_fields` — в строку `ai_logs` разбора того же `client_request_id` (метрика «доля правок», D-35); `inbox_items` → `confirmed`; заметка `note_id` → `converted_*` (D-75 §5).

Выход: `{ result: { task_ids, announcement_ids, reminder_ids, recurrence_ids, note_ids, event_ids, point_ids, skipped, scheduled }, duplicate }`. Ошибки: `400 assignee_required`, `400 event_time_required`, `403 forbidden`.

### POST /api/voice/query — `[не построено, этап 3]`
План (D-34, G.6): только director, модель Sonnet-класса, tool use со `strict: true`; 5–8 инструментов (`search_tasks`, `employee_tasks`, `overdue_list`, `who_not_reported`, `summary_today`, `employee_score`), параметр-исполнитель — только валидный `user_id` (enum из ростера); факты — только из tool results; максимум 4 итерации, таймаут 15 с; обёртки под RLS-контекстом директора, не service role; карточки ответа рендерит бэкенд из tool results; ручной SSE через `@anthropic-ai/sdk` (`text_delta`, `cards`, `done`, `error`). **Vercel AI SDK в стек не вносить.**

## 3. RPC-функции (контракт транзакций)

Все — `security definer`, в миграциях, проверяют роль вызывающего через `auth_role()` / `auth_company_id()`; `execute` отозван у `public`/`anon`. Полный список с сигнатурами — DATABASE.md «Атомарные операции».

| Функция | Сигнатура | Поведение |
|---|---|---|
| `confirm_voice_batch` | `(payload jsonb, client_request_id uuid, p_now timestamptz) → jsonb` | §2 |
| `transition_task` | `(task_id uuid, to_status task_status, payload jsonb, client_request_id uuid) → jsonb` | Единая точка переходов; матрицу §7 по роли проверяет `trg_task_status_guard`; ошибки `invalid_transition`, `task_not_found`. `payload`: `reason` («Не могу» → строка треда `meta.decline_reason`), `comment` (доработка → `meta.rework_comment`), `report: {text?, file_path?}` (сдача → строка треда `meta.report`, тип `photo` при файле; в той же транзакции, D-64 §3; outbox её пропускает — о сдаче говорит `pending_review`) |
| `revoke_task` | `(task_id uuid, client_request_id uuid) → jsonb` | D-01: только director; статус до `done`/`revoked` (в т.ч. `declined` — «Отменить») → `revoked`, у сотрудника карточка «отозвано директором»; `scheduled` — физический delete (никому не доставлена) |
| `extend_task_deadline` | `(task_id uuid, new_deadline timestamptz, client_request_id uuid) → jsonb` | «Продлить» (D-51 п.3): только director, открытая задача (`sent, accepted, in_progress, rework, pending_review`); новый срок или `null` («Срок снят»); системная строка «Срок продлён до DD.MM HH:MM» в треде; outbox `deadline_extended` адресату (не при снятии срока) |
| `reassign_task` | `(task_id uuid, new_assignee_id uuid, client_request_id uuid) → jsonb` | «Переназначить» (D-80 §5): только director, исходные `sent, accepted, in_progress, rework, declined`; клон новому активному человеку (`parent_task_id` = старая) — `sent` внутри окна доставки, вне окна — `scheduled` на `next_delivery_slot` (выпуск — наряд 017); старая → `revoked` с системной строкой «Переназначено: Имя». Ошибки `same_assignee`, `assignee_not_found` |
| `delete_task` | `(task_id uuid) → jsonb`, без `client_request_id` | Жёсткое удаление (D-58): только director своей компании, без следа; `task_messages`/`notification_deliveries` каскадом, `point_transactions` остаются (append-only) с `task_id = null`, у клона-переназначения обнуляется `parent_task_id`. Отзыв (D-01) — штатный способ забрать поручение |
| `purge_closed_tasks` | `() → jsonb`, без `client_request_id` | «Очистить закрытые» (D-58): все `done`/`declined`/`revoked` компании директора, те же правила по детям; возвращает `{deleted}` |
| `mark_thread_read` | `(task_id uuid, seq bigint) → bigint` | Курсор прочтения треда (D-61/D-64): upsert своей строки `task_reads` с `greatest(old, new)` — назад не ходит (оффлайн-повтор старого «Прочитал» безвреден); та же транзакция закрывает квитанции `message` этого треда до `seq` (`acted_at`). Только своя компания, иначе `task_not_found`. Единственный способ двигать курсор; зовут открытие треда, «Прочитал» на карточке, ответ, `/api/push/acted` |
| `next_delivery_slot` | `(p_company uuid, p_now timestamptz) → timestamptz` | null внутри окна доставки компании, иначе ближайшее открытие окна (Asia/Aqtobe). Общее правило D-38 для производителей задач и для `deliver_after` |
| `award_points` | `(p_user_id uuid, p_amount int, p_reason text, client_request_id uuid) → jsonb` | `[за флагом: settings.points_enabled]` в интерфейсе; сама функция флаг не проверяет. Только director; `amount ≠ 0`, причина обязательна всегда (D-30), получатель — активный человек компании; `point_transactions(source='manual')`; возвращает `{id, balance}`. Ошибки `amount_required`, `reason_required`, `user_not_found` |
| `fn_rating` | `(p_from timestamptz, p_to timestamptz) → table(user_id, display_name, points, rank, delta_vs_prev, on_time_pct, is_me)` | Рейтинг за период (D-11, D-29): состав — активные `team_role()`; `rating_mode='top5'` — топ-5 + строка запрашивающего, директору — все |
| `update_company_settings` | `(patch jsonb) → jsonb`, без `client_request_id` | Только director; `settings || patch` — секции заменяются целиком (роут дополняет их текущими значениями) |
| `update_company_profile` | `(p_name text) → jsonb`, без `client_request_id` | Только director; название 1–120 символов, иначе `invalid_name` (G.20d) |
| `create_shop_order` | `(p_item_id uuid, client_request_id uuid) → jsonb` | Advisory lock на пользователя; баланс `SUM(point_transactions) ≥ price` и остаток; insert order(`pending`, снимок цены, `stock_reserved`) + `point_transactions(shop_hold, −price)` + декремент stock (`stock is null` = без ограничения, не трогается); outbox `shop_order` директору и завхозу (кроме заказчика). Роль `tv` — `forbidden`. Ошибки: `insufficient_points`, `out_of_stock`, `item_not_found` |
| `cancel_shop_order` | `(p_order_id uuid, client_request_id uuid) → jsonb` | Владелец — только из `pending` (D-37); director/shopkeeper — из `pending/approved`. `point_transactions(shop_release, +price)` ровно на сумму холда по `order_id`; остаток возвращается, только если резервировался (`stock_reserved`); чужую отмену владелец узнаёт из outbox `shop_cancelled`. Ошибки: `wrong_status`, `order_not_found`, `forbidden` |
| `set_shop_order_status` | `(p_order_id uuid, p_status order_status, client_request_id uuid) → jsonb` | Завхоз/директор ведёт заказ: `pending → approved`, `pending\|approved → delivered`; свой заказ не проводит никто; outbox `shop_approved` / `shop_ready` владельцу. Выдача новых транзакций **не пишет** — hold финален, `shop_final` не существует (D-10) |
| `respond_event` | `(p_event uuid, p_status text, p_reason text) → event_participants`, без `client_request_id` (D-78 §6) | «Буду» / «Не смогу»: только позванный на неотменённое мероприятие; `going \| declined` (причина — только к отказу); отказ сразу шлёт автору `event_declined` |
| `set_event_participants` | `(p_event uuid, p_add uuid[], p_remove uuid[]) → void`, без `client_request_id` | Только director: добавить активных людей компании (приглашение — триггером), убрать кого угодно, кроме автора |
| `edit_event` | `(p_event uuid, p_title text, p_starts_at timestamptz, p_ends_at timestamptz, p_location text, p_body text, p_remind_before_min int, p_everyone boolean, p_participant_ids uuid[]) → events`, без `client_request_id` (D-94 §4) | Только director: все поля и состав атомарно; убранным, кто знал о встрече, — «Отмена» (ещё не ушедшее приглашение снимается), оставшимся — «Перенос» / «Новое место»; по прошедшей встрече — ничего |
| `delete_event` | `(p_event uuid) → void`, без `client_request_id` (D-94 §5) | Только director: строки больше нет; тем, кто знал о будущей встрече, — «Отмена», всё стоящее в очереди по ней снимается; повтор безвреден |
| `events_due_reminders` | `(p_now timestamptz) → int` | Только `service_role`, из минутного тика (§10): мероприятия, у которых наступило `starts_at − remind_before_min` и не прошло больше часа от начала, → `event_reminder` участникам, кроме отказавшихся, + `tv_events` вида `event`; идемпотентно через `events.reminded_at` (D-78 §5) |
| `notes_due_reminders` | `(p_now timestamptz) → int` | Только `service_role`, из минутного тика (§10): заметки с наступившим `remind_at` → `note_reminder` автору, идемпотентно по `reminded_at` (D-95) |
| `notes_purge_trash` | `(p_now timestamptz) → int` | Только `service_role`, из минутного тика: удаляет заметки, лежащие в корзине дольше 3 дней (D-95) |
| `transition_errand` | `(p_id uuid, p_to text, p_reason text, client_request_id uuid) → jsonb` | Автомат заявки (D-79 §1): `accepted` — только `secretary`, забирает первая (`already_claimed` остальным); `done` — взявшая; `declined` — секретарь из `sent` или взявшая из `accepted`; `cancelled` — автор из `sent`/`accepted` (пуша нет, очередь снимается). Ошибки `forbidden`, `bad_status`, `bad_transition` |
| `errands_due_escalation` | `(p_now timestamptz) → int` | Только `service_role`, из минутного тика: один повторный `errand_sent` (`meta.repeat`) секретарям по заявке, никем не взятой за `settings.secretary.escalate_after_min` (дефолт 3), не старше часа; идемпотентно через `errands.escalated_at` (D-79 §6) |
| `thank_errand` | `(p_id uuid, client_request_id uuid) → jsonb` | «Спасибо ♥» (D-97 §10): только автор и только `done`; ставит `errands.thanked_at`, повтор держит время первого; пуша нет |
| `announce_visit` | `(p_note text, client_request_id uuid) → visits` | «К вам посетитель» (D-96): только `secretary`; пуш `visit_arrived` директорам сразу; поднимает версию стены (`tv_touch`) |
| `answer_visit` | `(p_id uuid, p_answer text) → visits`, без `client_request_id` (D-96 §6) | Только director: `invited` / `wait` / `declined`; `invited` включает гостя на час (`tv_state.guest_until`); пуш `visit_answered` автору |
| `close_visit` | `(p_id uuid) → visits`, без `client_request_id` | Убрать карточку визита |
| `visits_due_expiry` | `(p_now timestamptz) → int` | Только `service_role`, из минутного тика: визит без ответа гаснет (20 минут, после «Подождёт» — час) |
| `tv_control`, `tv_focus`, `tv_heartbeat`, `tv_summary`, `tv_calendar`, `tv_overlay` | §8 | Пульт и киоск ТВ |

## 4. Подсистема доставки уведомлений — продуктовая фича №1

«Директор видит, кто не увидел поручение» — это SELECT по этой подсистеме, а не инфраструктурная деталь.

### Outbox
Таблица `notification_deliveries` (схема в DATABASE.md): `event_kind`, `status enum('queued','sent','failed')`, `channel enum('push','telegram','sms')` (используется только `push`), `tier` (всегда 1), `attempts`, `last_error`, `meta` (`title`, `body`, `url`, `tag`… рендерит триггер — воркер ничего не сочиняет), `deliver_after`, `sent_at`, `seen_at`, `acted_at`.

- **Триггер БД вставляет строку `queued` — и НИКОГДА не зовёт HTTP.** Push задачи `task_sent` рождается только при вставке со статусом `sent` или при переходе в `sent`.
- **Воркер — `lib/push/send.ts` `sweepDeliveries()`** (G.20c): до 50 строк `queued`, `channel='push'`, `attempts < 3`, `deliver_after <= now()` → web-push на все подписки человека → `sent`; неудача → `attempts+1`, на третьей — `failed`; нет ни одной подписки → сразу `failed`, `last_error='no_subscription'` (директору — «уведомления не включены у сотрудника»). Без VAPID-ключей строки остаются `queued` — квитанция не подделывается.
- **Пинок** — `kickDeliveries()` через `after()` из `/api/voice/confirm`, `/api/tasks/:id/transition`, `/deadline`, `/reassign`, `/api/errands`; **страховка** — минутный тик `/api/push/sweep` (§10).
- **Минутный свип** `POST /api/push/sweep` (Vercel cron, сервисный ключ) перед отправкой очереди зовёт тики, каждый сам по себе (ошибка одного пишется в лог и не валит свип): `events_due_reminders` (D-78), `errands_due_escalation` (D-79), `notes_due_reminders` — напоминания заметок, пуш `note_reminder` автору без тихих часов, ссылка `/notes?n=<id>` — и `notes_purge_trash` — корзина заметок старше 3 дней (D-95), `visits_due_expiry` — визит без ответа гаснет (D-96).

### Ack-семантика (D-32)
«Увидел» = SW шлёт `POST /api/push/seen {delivery_id}` при показе уведомления, ЛИБО открытое приложение шлёт тот же роут без `delivery_id` и закрывает все незакрытые строки человека (`seen_at`). «Принял» = переход задачи в `accepted` ставит `acted_at` строке `task_sent`; для `message` — `mark_thread_read`. Статусы директору: **«отправлено / увидел / принял»**; формулировка индикатора — «не открывал с 9:14», никогда «не получил» (Web Push не подтверждает доставку).

### Эскалация — `[не построено]` (D-32 ◐, D-21 🔴, D-41 🔴)
План: ярус 1 — push; ошибка отправки или нет `seen_at` за таймаут в рабочие часы → ярус 2 — Telegram-дубль с кнопками «Принял / Вопрос» (§5); ярус 3 — SMS: канал в enum заложен, в v1 не строится (D-41). Дедупликация: ярус N+1 стреляет, только если ярус N не подтверждён (`seen_at is null`) по таймауту — иначе сотрудники замьютят бота. Эскалация заявок секретарю — отдельная и есть: повторный push, §3 `errands_due_escalation`.

### Гигиена канала
- Чистка подписок: ответ `404`/`410` → подписка удаляется немедленно `[есть]`.
- Еженедельный health-check подписок с отчётом «у кого канал мёртв» — `[не построено]`.
- Окно доставки (D-38, `company.settings.delivery_window`, дефолт 08:00–21:00 Asia/Aqtobe): триггер `trg_notification_deliveries_deliver_after` ставит `deliver_after = next_delivery_slot(...)` видам, которые ждут окна (матрица ниже); задачи вне окна производители кладут `scheduled` (§2, §3), их выпуск — `[не построено]`, наряд 017.

### Матрица нотификаций (по триггерам и RPC в миграциях)

| `event_kind` | Кто порождает | Получатель | Заголовок | Ссылка | Окно доставки |
|---|---|---|---|---|---|
| `pending_review` | триггер на `tasks` | автор задачи | «На приёмку» | `/tasks/{id}` | сразу |
| `declined` | триггер на `tasks` | автор задачи | «Не может выполнить» | `/tasks/{id}` | сразу |
| `message` | триггер на `task_messages` (text/voice/photo, кроме причины отказа, комментария доработки и отчёта) | участники треда (автор ∪ исполнитель), кроме отправителя | «{Имя} · «{title}»» / «Вопрос по «{title}»» + слова (фото и голосовое — своими словами) | `/tasks/{id}` | автору задачи — сразу (D-51 п.2, 🟡), остальным — ждёт окна |
| `task_sent` | триггер на `tasks` (вставка `sent` или переход в `sent`) | исполнитель | «Новая задача» | `/tasks/{id}` | сразу (момент выбрал производитель) |
| `rework` | триггер на `tasks` | исполнитель | «Директор вернул задачу» | `/tasks/{id}` | ждёт окна |
| `done` | триггер на `tasks` | исполнитель | «Принято» | `/tasks/{id}` | ждёт окна |
| `revoked` | триггер на `tasks` (из открытых статусов, в т.ч. при переназначении) | исполнитель | «Отозвано директором» | `/tasks/{id}` | ждёт окна |
| `deadline_extended` | `extend_task_deadline` | исполнитель | «Срок продлён до …» | `/tasks/{id}` | ждёт окна |
| `announcement` | триггер на `announcements` | все активные, кроме `tv` и автора | «Объявление» | `/ether` | ждёт окна |
| `shop_order` | `create_shop_order` | director и shopkeeper, кроме заказчика | «Заказ в магазине» | `/shop` | сразу |
| `shop_approved` / `shop_ready` | `set_shop_order_status` | владелец заказа | «Заказ подтверждён» / «Заказ готов» | `/shop` | ждёт окна |
| `shop_cancelled` | `cancel_shop_order`, если отменил не владелец | владелец заказа | «Заказ отменён» | `/shop` | ждёт окна |
| `event_invite` | триггер на `event_participants` | позванный (не автор) | «Приглашение» | `/calendar?e={id}` | ждёт окна |
| `event_moved` / `event_cancelled` | триггер на `events` | участники, кроме автора (перенос — кроме отказавшихся) | «Перенос» / «Отмена» | `/calendar?e={id}` | ждёт окна |
| `event_reminder` | `events_due_reminders` | участники, кроме отказавшихся (и автор) | «Скоро» | `/calendar?e={id}` | сразу (D-78 §5) |
| `event_declined` | `respond_event` | автор мероприятия | «Не сможет» | `/calendar?e={id}` | сразу |
| `errand_sent` | триггер на `errands`; повтор — `errands_due_escalation` | все активные `secretary`, кроме автора | надпись кнопки / «Ещё раз: …» | `/secretary?e={id}` | сразу (D-79 §6) |
| `errand_accepted` / `errand_done` / `errand_declined` | триггер на `errands` | автор заявки | «Принято · Имя» / «Готово · Имя» / «Не может · Имя» | `/secretary?e={id}` | сразу |
| `note_reminder` | `notes_due_reminders` | автор заметки | напоминание заметки | `/notes?n={id}` | сразу (D-95) |
| `visit_arrived` | триггер на `visits` | директора компании | «К вам посетитель» | `/pulse` | сразу (D-96) |
| `visit_answered` | триггер на `visits` | секретарь-автор | ответ директора | `/feed` | сразу (D-96) |

Про `message`: **схлопывание** — пока строка ещё `queued`, следующее сообщение того же треда не создаёт новую, а обновляет её («N новых сообщения · последние слова»), один сигнал на очередь, а не N. **Не сообщения:** причина отказа, комментарий к доработке и отчёт при сдаче — у них свои события (`declined`, `rework`, `pending_review`). **Квитанцию закрывает** `mark_thread_read` — «Прочитал» из шторки или открытый тред. В таблице могут лежать строки прежних видов `question` и `reply` — новых не появляется. Очки (`award_points`) уведомлений не порождают.

## 5. Telegram — `[не построено]` (D-21 🔴)

План: привязка — обязательный шаг онбординга (D-21): PWA получает одноразовый код (TTL 15 мин) → deep-link `https://t.me/<bot>?start=<code>` → вебхук на `/start` пишет `profiles.telegram_chat_id` (колонка есть, больше ничего нет). Вебхук сверяет заголовок `X-Telegram-Bot-Api-Secret-Token` с `TELEGRAM_WEBHOOK_SECRET`, несовпадение → 401. Inline-кнопки «Принял / Вопрос» → `transition_task` / сообщение в треде, `acted_at` в доставке. Бот — grammY; на dev — отдельный тестовый бот.

## 6. Очки, реакции, магазин

- **Очки** `[за флагом: settings.points_enabled]` (D-48, дефолт выключено): ручное начисление и снятие — RPC `award_points` прямо из клиента (`lib/points/queries.ts`), только director, причина обязательна всегда, `amount ≠ 0` (D-30). Голосом — только плюс и только при включённом флаге (`confirm_voice_batch`); из `source='shared'` очков нет (D-36). Рейтинг — `fn_rating` (§3).
- **Авто-правила и автоштрафы** (`auto_penalties_enabled`, D-28 🔴) — `[не построено]`; ключ идемпотентности `(task_id, rule_code) where source='auto_rule'` в схеме есть (D-31).
- **Реакции** (`/api/reactions`, `reaction_points`) — `[не построено]`.
- **Магазин** — только RPC `create_shop_order` / `cancel_shop_order` / `set_shop_order_status` (§3), hold-final (D-10). Баланс всегда = `SUM(point_transactions)`, нигде не хранится.

## 7. Статусная машина задач

`scheduled → sent → accepted → pending_review → done | rework(→accepted) | declined | revoked`. `in_progress` в enum остаётся, переходов в него нет (D-04). «Уточнить» — не статус: `meta.is_question` на сообщении + `meta.answered_at` триггером при первом ответе автора задачи (G.7).

| Переход | Кто |
|---|---|
| `scheduled → sent` | только service role (guard пускает при `auth.uid() is null`); исполнитель — минутный тик, `[не построено]`, наряд 017 |
| `sent → accepted` | исполнитель («Принял»; из Telegram — `[не построено]`) |
| `sent/accepted → declined` | исполнитель; причина — `payload.reason`, сервер её не требует |
| `accepted → pending_review` | исполнитель (отчёт — в той же транзакции, D-64 §3) |
| `pending_review → done \| rework` | только director |
| `rework → accepted` | исполнитель |
| `declined → sent` | director («Настоять», G.20; `closed_at` обнуляется) |
| любой, кроме `done`/`revoked`, → `revoked` | director (`revoke_task`, в т.ч. из `declined` — «Отменить»; `reassign_task` для старой задачи) |
| `scheduled → (delete)` | director (`revoke_task`), до отправки |

Всё остальное — `invalid_transition` (роут отвечает `409`).

## 8. ТВ-режим (D-76)

- Киоск — **auth-пользователь роли `tv`** (не anon): по RLS видит только свой профиль, `tv_events` (предмаскированный `payload_guest`) и `tv_state` своей компании, зовёт `tv_summary(p_guest)`, `tv_focus()`, `tv_calendar(p_guest)`, `tv_overlay()`, `tv_heartbeat(p_applied_version)` (D-96). Логин на устройстве один раз; после входа роль `tv` приземляется прямо на `/tv` (`homeForRole`).
- **Состояние стены — строка `tv_state`** (одна на компанию): `mode` (`ether | employee | task`), `employee_id`, `task_id`, `scene` (`face | clock | team | calendar`), `clock_style` (`digital | analog`), `guest`, `guest_until`, `expires_at`, `version`, `reload_requested_at`, `seen_at`, `applied_version`, `updated_by`. Политик на запись нет вовсе; киоск и пульт слушают строку через Postgres Changes под RLS (D-76 §1). Отдельного HTTP-роута у пульта нет.
- **Команды — только RPC `tv_control(p_mode, p_employee_id, p_task_id, p_scene, p_guest, p_reload, p_clock)`** (security definer, роль `director`): абсолютное состояние, `null` = «не трогать», каждая команда поднимает `version`; повтор безвреден — `client_request_id` не заводится (исключение из принципа 7, D-76 §2–3). Фокус живёт 10 минут (`expires_at`), возврат в эфир считает киоск по своим часам, без cron. Режим `task` схемой допущен, UI его не строит.
- **Данные фокуса — RPC `tv_focus()`** (роли `tv`/`director`): сотрудник и до 8 открытых дел (`sent, accepted, in_progress, rework, pending_review`), маска гостя в БД (имя без фамилии, `title = null`), просрочка не помечается (D-45).
- **Сводка стены — `tv_summary(p_guest)`**: пульс дня по часам, ближайшие мероприятия, вердикт числами без имён, три числа дня, топ-5 недели через `fn_rating`, загрузка людей, закрытое за неделю, выдачи наград; маска гостя внутри. Неделя мероприятий для стены — `tv_calendar(p_guest, p_days)` (роль `tv` таблицу `events` не читает); надпись поверх любой сцены (посетитель, скорое мероприятие) — `tv_overlay()` (D-96 §3, §6–7).
- **«К вам посетитель» (D-96)**: `POST /api/visits` (secretary → RPC `announce_visit`, пуш директору сразу) и `POST /api/visits/[id]/answer` (director → `answer_visit`, пуш секретарю сразу); закрытие — RPC `close_visit` с клиента; минутный свип зовёт `visits_due_expiry` (20 минут без ответа, после «Подождёт» — час). Визит поднимает версию `tv_state`, киоск перечитывает надпись `tv_overlay()`.
- Guest-режим — поле `tv_state.guest` (переключатель «Гость в кабинете» на пульте, D-33; «Пусть заходит» посетителю включает его на час — `guest_until`, D-96); `?guest=1` — лишь стартовое значение до прихода строки.
- **Квитанция экрана** — `tv_heartbeat(p_applied_version)` от роли `tv` раз в минуту и после каждого применённого состояния; пульт показывает «На стене» / «Отправлено, экран ещё не показал» / «Экран не отвечает с 9:14» (принцип 8). Перезапуск с пульта — `reload_requested_at`; киоск сравнивает отметку с временем своей загрузки.
- Чистка хвоста `tv_events` — функция `tv_events_prune(p_days)` есть, вызова нет `[не построено]`.

## 9. Контракт ошибок AI-конвейера (для фронта)

| Состояние | HTTP | JSON | Поведение фронта |
|---|---|---|---|
| upload-fail | — (Storage напрямую) или `502` | ошибка signed-URL upload / `upload_url_failed` | ретрай с этапа загрузки; запись держится в сторе `lib/store/ingest.ts` (IndexedDB-очереди нет) |
| stt-fail | 502 | `{error:{code:'stt_failed'}, audio_path}` | «Не расслышал» + ретрай по сохранённому `audio_path`, без перезаписи |
| empty-transcript | 200 | `{transcript: null, code:'empty_transcript', guard}` | guard отбраковал не-речь; парсер не вызывался |
| empty-entities | 200 | `{entities:[]}` | показать сырой транскрипт + «Повторить / отправить как текст» |
| errand | 200 | `{entities:[], errand, model:'matcher'}` | заявка секретарю без подтверждения (D-79 §9) |
| refused (отказ модели) | 422 | `{error:{code:'parse_refused'}, transcript}` | сырой транскрипт + ручной ввод |
| parse-fail | 502 | `{error:{code:'parse_failed'}, transcript}` | сырой транскрипт + ретрай |
| low-confidence | 200 | `assignee_confidence`/`deadline_confidence` ниже порога | не ошибка: жёлтый/красный чип, отправка сущности с нераспознанным исполнителем заблокирована (D-16/D-36) |
| confirm без исполнителя / времени | 400 | `assignee_required` / `event_time_required` | вернуть карточку на правку |
| duplicate confirm | 200 | `{result, duplicate:true}` | обычный success (те же id) |
| timeout | 504 | — | сервер кода `ai_timeout` не формирует; клиент (`lib/voice/api.ts`) так называет любой ответ 504 |
| rate_limited | 429 | — | сервер не отдаёт (лимитов нет, §1); клиент на 429 показывает `rate_limited` |

## 10. Минутный тик

pg_cron, pg_net и Edge Functions не подключены (G.20c). Единственное расписание — Vercel cron в `vercel.json`: `* * * * *` → `/api/push/sweep` с заголовком `Authorization: Bearer <CRON_SECRET>` (без секрета — `401`). Роут экспортирует только `POST`, а Vercel cron вызывает `GET` — исправление в наряде 017.

Один вызов тика делает по порядку: `events_due_reminders()` (D-78), `errands_due_escalation()` (D-79), `notes_due_reminders()` и `notes_purge_trash()` (D-95), `visits_due_expiry()` (D-96), `sweepDeliveries()` (outbox, §4). Сбой одного шага логируется и не останавливает рассылку. Выпуск отложенных задач `scheduled → sent` (`publish_due_scheduled`) — `[не построено]`, наряд 017.

Исполнителя нет `[не построено]` у: повторов (`recurrence_rules`) — записываются, но не исполняются (наряд 017, «Вне скоупа»); «напомни мне» с D-95 — заметка со временем, её исполняет `notes_due_reminders`; пометки просрочек и авто-очков (D-28); вечерней сводки директору; еженедельной проверки подписок (§4); чистки аудио старше срока хранения (D-18 ◐, D-66 п.6); чистки `tv_events` (`tv_events_prune`); подсчёта streak.

## 11. Environments (D-19)

Сейчас есть только dev-проект Supabase; прод-проекта и CI нет (D-19 🔴). План: **dev** и **prod**, Vercel preview → dev, production → prod; миграции в dev — `pnpm db:push`, в prod — только из CI `[не построено]`. Отдельные VAPID-пары на среду. **Смена VAPID-ключей = мгновенная смерть всех push-подписок** — prod-пару не трогать никогда без плана ре-подписки.

| Переменная | Где | Примечание |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | по средам |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server) | никогда в клиенте |
| `SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` | локально | только CLI (`db:push`, `db:reset`), в Vercel не нужны |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Vercel | STT и парсер |
| `ELEVENLABS_API_KEY` / `DEEPGRAM_API_KEY` | Vercel | ключи запасных STT-провайдеров из `settings.stt` (D-53) |
| `DEEPSEEK_API_KEY` | Vercel | только сравнение в «Лаб» (D-63) |
| `STT_PROVIDER` / `STT_FALLBACK_PROVIDER` | Vercel | значения по умолчанию `getSttProviders()`; роут транскрипции берёт провайдеров из `settings.stt` |
| `PARSER_MODEL` / `PARSER_ESCALATION_MODEL` | Vercel | значения по умолчанию `lib/ai/parse.ts`; роут парсера передаёт модели из `settings.parser` |
| `QUERY_MODEL` | — | зарезервировано под `/api/voice/query` `[не построено]`, код не читает |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Vercel | отдельные пары dev/prod; без ключей воркер не шлёт ничего |
| `CRON_SECRET` | Vercel | Bearer минутного тика §10 |
| `DEMO_RESET_ENABLED` / `NEXT_PUBLIC_DEMO_MODE` | только dev/демо | серверный замок и видимость кнопки «Обнулить демо-базу» (D-58); прод клиента их не ставит |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | — | зарезервировано: Telegram `[не построено]` (§5) |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | — | зарезервировано: Sentry `[не построено]` |

## 12. Наблюдаемость

- Ошибки роутов — `console.error` в логи Vercel без тела запроса и ключей (`withAuth`, §1).
- Алерты на рост `failed` в `notification_deliveries` и на `status='error:*'` в `ai_logs` — `[не построено]`.
- `ai_logs` (схема в DATABASE.md): каждый вызов STT и парсера — провайдер, модель, латентность по этапам, токены (`input`, `output`, `cache_read`), `parsed/confirmed_entities` + `was_edited` / `edit_fields`, `source`, `client_request_id`, `status` (`ok` | `error:<код>`). Колонки стоимости нет: цену считает «Лаб» по `lib/ai/pricing.ts` (D-63). `tool_calls` не заполняется (вопросов к данным нет). Аудио в логи не пишется.
- `/api/health` — liveness без БД.
