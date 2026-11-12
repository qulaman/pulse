# BACKEND.md — серверный слой Pulse

Серверная часть как она есть в коде: роуты `app/api/`, `proxy.ts`, личность и права, голосовой конвейер со стороны сервера, доставка уведомлений, тик, вход по коду, сервер консоли разработчиков. Для того, кто меняет этот слой. Таблицы, политики и тела RPC — `docs/DATABASE.md`; промпт, STT и evals — `docs/AI.md`; среды и деплой — `docs/SETUP.md`; экраны — `docs/FRONTEND.md`. Где документ расходится с кодом, прав код (D-132). Бэкенд — route handlers, RPC из миграций и один Vercel cron; Edge Functions и pg_cron не используются (G.20c).

## Карта

- `app/api/` — 80 роутов, папка на модуль; `app/api/ops/` — консоль. `proxy.ts` — cookie и редиректы страниц.
- `lib/auth.ts`, `lib/api/handler.ts`, `lib/api/respond.ts` — личность, обёртка роута, ответы.
- `lib/supabase/server.ts` (cookie вызывающего), `lib/supabase/service.ts` (service role), `lib/supabase/client.ts` (браузер), `lib/supabase/types.ts` (типы); `lib/roster.ts` — ростер и настройки компании.
- `lib/push/send.ts` — воркер, `lib/push/policy.ts` — транспорт, `lib/push/prefs.ts` — правила директора, `lib/push/client.ts` — браузерная сторона.
- `lib/voice/retention.ts` — чистка голоса; `lib/voice/api.ts` — клиент голосовых роутов.
- `lib/login-code/` — код входа; `lib/people/access.ts` — кто кому меняет вход и карточку; `lib/ops/` — консоль.
- `lib/env.schema.ts`, `lib/env.ts`, `lib/env.public.ts` — окружение; `vercel.json` — регион и cron.

## 0. Незыблемые правила слоя

1. **Атомарность.** Многотабличная операция — только функция `security definer` через `rpc()`: supabase-js транзакций не умеет.
2. **Идемпотентность.** Мутация несёт `client_request_id` с клиента, повтор отдаёт первый результат (принцип 7); как — §1.
3. **Статус задачи меняет только RPC** (`transition_task`, `revoke_task`, `send_task_now`, `reassign_task`, `request_deadline`), не `update` из браузера или роута. Матрицу §7 держит триггер `trg_task_status_guard`.
4. **Формат ошибки**: `{ "error": { "code": "snake_case", "message_ru": "текст человеку" } }` (`apiError`), дополнительные поля (`audio_path`, `transcript`) — рядом с `error`.
5. **Одна база на всех клиентов (D-134).** Граница — `company_id` и RLS; код не ветвится по клиенту и не предполагает одну компанию; настраиваемое — в `company.settings` (D-44). Service role сужена до компании вызывающего (§1).
6. **Триггеры не зовут HTTP.** Уведомление — строка outbox, отправляет только воркер (G.20c, D-114).
7. **Секреты только на сервере**; тело запроса и ключи в логи не пишутся.

## 1. Личность, права, устройство роута

**Личность.** `getSessionProfile(req)` берёт токен из `Authorization: Bearer` (скрипты), иначе из cookie, проверяет JWT через `getClaims()` и читает свою строку `profiles` под этим токеном: нет — `401 unauthorized`, `is_active = false` — `403 inactive`; `requireRole` — `403 forbidden`. Роли: `director`, `manager`, `employee`, `shopkeeper`, `secretary`, `tv`; наборы `ADMIN_ROLES` (директор и секретарь, D-104) и `TEAM_ROLES` — `lib/routes.ts`.

Отзыв входа действует сразу (D-135): `auth_company_id()` и `auth_role()` отвечают только работающему с живой сессией (`auth_session_live()`), своя строка `profiles` без неё тоже не читается — отозванный получает `401`, уволенный `403`. Свои строки по `auth.uid()` отозванный токен читает до истечения, не дольше часа. `SessionWatch` в браузере зовёт `/api/me` при возврате и раз в 5 минут.

`proxy.ts` работает только для страниц (matcher исключает адреса API): обновляет cookie, без сессии ведёт на `/login`, с `/` — домой по роли, директора и секретаря с компьютера — на `/desk` (D-153), `/ops` отдаёт `lib/ops/proxy.ts`. Роуты API проверяют личность сами.

**Под чьей личностью идёт запрос.** `userSupabase(req)` несёт токен вызывающего — его RLS, RPC сами проверяют роль и компанию. `createServiceSupabase()` — service role, без RLS. Всё, что меняет состояние компании, идёт под вызывающим: RPC задач, визитов, отчёта, настроек, правил пушей, вставка заявки, имена и фото человека. Service role — только там, куда RLS не пускает: Storage, `auth.admin`, `ai_logs` и `inbox_items` конвейера, `ai_logs` для «Лаб» и словаря, свои подписки и доставки, карточка человека, `lib/roster.ts`, тик. Правило: каждый такой запрос сужен до `company_id` профиля или `user_id` вызывающего; чужое и несуществующее дают одно «не найдено»; право на файл решает чтение под вызывающим, service role лишь подписывает URL. Исключение: `/api/company/logo` и `PATCH /api/lab` пишут `companies.settings` напрямую по компании вызывающего, мимо `update_company_settings`.

**Шаблон роута** — `withAuth(roles, fn, schema?)`: по очереди личность, роль (`'any'` — любой работающий), JSON и zod (почти везде `strictObject`), затем `fn({ req, profile, body, params })`. Провал JSON или схемы — `400 validation_error`, `AuthError` — его статус, прочее — `console.error` и `500 internal`. Id пути роут проверяет сам (`z.uuid()` или `z.guid()`: id сида не RFC 4122), мусор — `404`. Ошибку RPC (`raise exception '<код>'`) роут узнаёт по коду в `error.message`, незнакомая — `500`. Роуты задач с ключом отвечают `{ result, duplicate }`. `after()` нужен только чтобы отправить пуши после ответа: колбэк возвращает промис `kickDeliveries()`, и платформа держит функцию до конца отправки (D-125).

Без `withAuth`: `/api/me` (тот же контракт), `/api/company/logo` (multipart), `/api/auth/code` (без сессии, §13), `/api/push/sweep` (секрет cron, §10), `/api/health` и `/api/version` (публичные), роуты `app/api/ops/` (§14). Лимитов частоты нет, кроме входа по коду.

**Идемпотентность.** Ключ один на намерение, рождается на клиенте и живёт до ответа: TanStack Query возобновляет мутацию, `lib/outbox.ts` хранит POST и досылает при запуске (до 24 ч), фраза ждёт в IndexedDB (`lib/voice/kept.ts`, D-130). У фразы ключ один от `upload-url` до `confirm`. Повтор сервер узнаёт: RPC — по `ingest_batches` (сохранённый результат и `duplicate: true`); роуты, пишущие сами, — по уникальному индексу (`errands`, `inbox_items`, `profiles.client_request_id`); `parse` — по удачной строке `ai_logs`; проверка пушей — по `crid` в `meta`; правила парсера — по `parser_rules.request_id`; консоль — по журналу. Без ключа — мутации, повтор которых безвреден: абсолютное состояние или множество (ответ на визит, настройки, словарь, правила пушей, фото, отзыв сессий) и удаление (`delete_task`, `purge_closed_tasks`).

**Роуты.** «Все» — любой работающий профиль, «Д» — директор, «Д, С» — директор и секретарь, «К» — `TEAM_ROLES`.

| Путь | Метод | Кто | Что | Чем |
|---|---|---|---|---|
| `/api/voice/upload-url` | POST | все | URL загрузки записи | Storage, `inbox_items` |
| `/api/voice/transcribe` | POST | Д | распознать фразу | `transcribe()` |
| `/api/voice/parse` | POST | Д | разобрать фразу | `parseTranscript()` |
| `/api/voice/confirm` | POST | Д | сохранить пачку | `confirm_voice_batch` |
| `/api/voice/audio-url` | GET | все | URL записи | Storage |
| `/api/tasks/[id]/transition` | POST | все | переход статуса | `transition_task` |
| `/api/tasks/[id]/revoke` | POST | Д | отозвать | `revoke_task` |
| `/api/tasks/[id]/send-now` | POST | Д | отправить отложенную | `send_task_now` |
| `/api/tasks/[id]/deadline` | POST | Д | срок | `extend_task_deadline` |
| `/api/tasks/[id]/reassign` | POST | Д | передать другому | `reassign_task` |
| `/api/tasks/[id]/deadline-request` | POST | исполнитель | просить срок | `request_deadline` |
| `/api/tasks/[id]/deadline-answer` | POST | Д | ответ на просьбу | `answer_deadline_request` |
| `/api/tasks/[id]/nudge` | POST | Д | напомнить | `nudge_task` |
| `/api/tasks/[id]/delete` | POST | Д | удалить | `delete_task` |
| `/api/tasks/purge` | POST | Д | удалить закрытые | `purge_closed_tasks` |
| `/api/errands` | POST | Д | заявка секретарю | `errands` |
| `/api/visits` | POST | секретарь | посетитель, сообщение | `announce_visit` |
| `/api/visits/[id]/answer` | POST | Д | ответ на визит | `answer_visit` |
| `/api/daily-report` | POST | К | сдать отчёт | `submit_daily_report` |
| `/api/files/upload-url` | POST | все | URL загрузки фото | Storage |
| `/api/files/url` | GET | все | URL файла сообщения | Storage |
| `/api/push/subscribe` | POST, DELETE | все | подписка браузера | `push_subscriptions` |
| `/api/push/devices` | GET, PATCH, DELETE | Д | свои устройства | `push_subscriptions` |
| `/api/push/test` | POST, GET | все; другому — Д, С | проверка пушей | outbox |
| `/api/push/kick` | POST | все | пинок воркера | `kickDeliveries()` |
| `/api/push/badge` | GET | все | число на иконке | `tasks` |
| `/api/push/seen` | POST | все | «увидел» | outbox |
| `/api/push/acted` | POST | все | «Прочитал» из шторки | `mark_thread_read` |
| `/api/push/sweep` | GET, POST | cron | тик | §10 |
| `/api/me` | GET | сессия | свой профиль | `getSessionProfile` |
| `/api/me/notifications` | GET, PUT | Д | правила пушей | `set_notify_prefs` |
| `/api/people` | POST | Д, С | новый человек | `auth.admin` |
| `/api/people/[id]` | GET, DELETE | Д, С | удалима ли карточка, открытые задачи (`?history=1` — история по видам для диалога «Удалить…», D-160); удалить карточку без истории | `auth.admin` |
| `/api/people/[id]/avatar` | PUT, DELETE | Д, С | фото | `profiles` |
| `/api/people/[id]/login-code` | POST, GET | себе — все; другому — Д, С | код входа | `issue_login_code` |
| `/api/people/[id]/sessions` | POST | себе — все; другому — Д, С | выйти везде | `revoke_sessions` |
| `/api/people/[id]/password` | POST | Д, С | пароль | `auth.admin` |
| `/api/people/[id]/login` | GET, PATCH | Д, С | почта входа | `auth.admin` |
| `/api/auth/code` | POST | без сессии | вход по коду | `redeem_login_code` |
| `/api/company` | GET, PATCH | Д, С | название, бренд | `update_company_profile`, `update_company_settings` |
| `/api/company/logo` | POST | Д, С | логотип | бакет `brand` |
| `/api/settings` | GET, PATCH | Д, С | настройки | `update_company_settings` |
| `/api/settings/vocabulary` | POST | Д, С | слова словаря | `applyVocabularyEdit` |
| `/api/dictionary/kinds` | POST | Д, С | типы слов | `applyKindEdit` |
| `/api/dictionary/aliases` | POST | Д, С | формы имени | `profiles` |
| `/api/dictionary/words` | GET, POST | Д, С | частота слов | `ai_logs` |
| `/api/dictionary/misheard` | GET, POST | Д, С | «как услышано — кто» | `collectMisheard` |
| `/api/lab` | GET, PATCH | Д, С | цена разборов; модели | `lib/ai/pricing.ts` |
| `/api/lab/recordings` | POST | Д | записи «в корпус» | `voice_kept` |
| `/api/lab/parser` | GET, PUT | Д, С | «Правила компании» | `update_company_settings` |
| `/api/lab/parser/try` | POST | Д, С | проба правил | `parseTranscript()` |
| `/api/lab/parser/eval` | POST | Д, С | часть прогона корпуса | `lib/ai/evals/stamp.ts` |
| `/api/health` | GET | публично | жив ли деплой | |
| `/api/version` | GET | публично | сборка (D-115) | `lib/version.ts` |

Неочевидное:

- `/api/errands`: надпись — из каталога `settings.secretary.actions`, у `kind: free` — первые слова фразы; тревогу (`urgent`) сервер ставит сам по сцене `security`.
- `POST /api/people`: секретарь не создаёт директора; без почты — служебный адрес `.invalid` и вход по коду; провал профиля удаляет созданный вход.
- `PATCH /api/settings` дополняет секцию текущими значениями: `update_company_settings` заменяет секцию целиком.
- `PUT /api/lab/parser` сохраняет непустые правила только с подписанным прогоном корпуса, прошедшим пороги (D-138).

## 2. Голосовой конвейер

Путь фразы: `upload-url`, загрузка браузером прямо в Storage, `transcribe`, `parse`, подтверждение, `confirm`. Запись лежит в Storage раньше любого вызова AI (принцип 5). Текст одной строкой идёт сразу в `parse`.

**`upload-url`**: вход `{ ext, context: director_input|task_message, client_request_id, recorded_at? }`, ответ `{ audio_path, signed_url, token, inbox_id? }`. Путь в бакете `voice` — `{company_id}/{user_id}/{client_request_id}.{ext}`, политики бакета держатся за сегменты пути. Объект уже лежит — `stored: true` с пустым URL, клиент идёт дальше (D-95). Для `director_input` вставляется строка `inbox_items`. Голосовое в треде не распознаётся (D-66): клиент сам вставляет `task_messages` с `type: voice`.

**`transcribe`** — только директор и `director_input`; `audio_path` обязан начинаться с `{company}/{user}/` вызывающего. Провайдеры — `settings.stt` компании, подсказка — ростер до 60 человек и `settings.vocabulary` (D-55), ретраи — внутри `transcribe()` (G.18). Исходы: `502 stt_failed` с `audio_path`; не-речь по стражу `lib/ai/stt-guard.ts` — `200` с `transcript: null` и `code: "empty_transcript"`; успех — `{ transcript, audio_path, stt_provider, latency_ms, suspicious }`. Каждый вызов провайдера пишет строку `ai_logs`. С `note_id` (диктовка в «Заметках», D-81) слова пишутся в заметку, если её текст ещё пуст.

**`parse`** `{ transcript, audio_path?, source: voice|typed|shared, client_request_id, suspicious?, assignee_id? }`:

1. Удачный разбор этого ключа в `ai_logs` — возвращается он.
2. Матчер (`lib/errands/matcher.ts`, D-79): короткая фраза без имени, совпавшая с кнопкой каталога, при секретаре на месте — `{ entities: [], errand, model: "matcher" }`.
3. Модель из `settings.parser` (`docs/AI.md`). Отказ — `422 parse_refused`, сбой — `502 parse_failed`, оба с `transcript`.
4. `lib/ai/postprocess.ts`: модель называет исполнителя, id ставит сервер (D-56); `suspicious` снижает уверенность до 0,5; `assignee_id`, выбранный до фразы, ставит `lib/ai/pin.ts` (D-84).
5. Строка `ai_logs`, `inbox_items` в `parsed`. Ответ `{ entities, model, escalated, latency_ms }`.

**`confirm`** `{ client_request_id, source, audio_path?, transcript, parsed_entities, confirmed_entities, force_now?, inbox_id?, note_id? }`: служебные поля карточек срезаются; `editDiff` даёт `was_edited` и `edit_fields` (D-35); уволенный исполнитель — `400 assignee_inactive`; `confirm_voice_batch` под личностью директора сохраняет пачку одной транзакцией и кладёт задачи вне окна в `scheduled`; при `force_now` объявления отпускает `send_announcements_now` (D-129); `after()` шлёт пуши. Ответ `{ result, duplicate }`, в `result` — id по видам, `skipped`, `scheduled`.

**`audio-url?path=`** — путь своей компании и видимая вызывающему строка с этой записью (`tasks`, `announcements`, `notes`, `events`), иначе `403`; URL на 600 с.

## 3. RPC: из роутов и прямо из браузера

Многие RPC браузер зовёт сам, под своим JWT: права, компания и идемпотентность проверяются внутри функции; после записи, рождающей пуш, клиент обычно зовёт `kickPush()` (§4). Прямые вызовы: тред — `mark_thread_read`; очки — `award_points`, `react_to_task`, `dispute_points`, `resolve_points_dispute`, `fn_rating`; магазин — `create_shop_order`, `cancel_shop_order`, `set_shop_order_status`; календарь — `respond_event`, `edit_event`, `delete_event`; заявки — `transition_errand`, `thank_errand`, `errand_eta`, `errand_ask`, `errand_answer`, `errand_result`, `errand_nudge`; визиты — `close_visit`, `director_busy`; отчёт — `my_daily_report`, `my_daily_report_history`, `team_daily_report_day`, `team_daily_report_period`; Эфир — `send_announcements_now`; стена — `tv_*`; доски — `mind_board_copy`; команда — `push_health`; «Лаб» — `voice_keep`. Что они делают — `docs/DATABASE.md`.

## 4. Доставка уведомлений

**Outbox** — `notification_deliveries`. Строки вставляют триггеры и RPC в транзакции производителя (строку `test` — роут проверки), слова (`meta.title`, `body`, `url`, `tag`) пишет база. Пуш задачи рождается только при вставке в `sent` или переходе в `sent`; сообщения одного треда, пока первая строка ждёт, схлопываются в неё.

**Воркер** — `sweepDeliveries()` в `lib/push/send.ts`, под service role:

1. Нет VAPID-ключей — строки остаются `queued`: квитанция не подделывается.
2. `claim_deliveries(50)` захватывает строки `queued`, `mode = now`, `attempts < 3`, `deliver_after <= now()` без захвата или с захватом старше 2 минут (`for update skip locked`): пинок и тик не шлют один пуш дважды.
3. По 8 строк одновременно, на включённые подписки получателя. Нет подписок — `failed`, `no_subscription`. Жизнь вида вышла (`ttlLeft()`, от `max(created_at, deliver_after)`) — `failed`, `expired`. Иначе web-push с TTL, равным остатку жизни.
4. `404` или `410` — подписка удаляется; другой отказ, включая `403`, пишется в подписку и её не удаляет: `403` бывает при неверном ключе самого деплоя (D-125).
5. Дошло хоть куда-то — `sent`, `sent_at`. Нет — `attempts + 1` и снова `queued`, на третьей попытке `failed`.
6. Пачки идут, пока очередь не пуста или не кончился бюджет: пинок — 8 с, тик — 40 с.

В нагрузке (`pushPayload()`) — слова, `url`, `tag` (одна задача — один пузырь), `delivery_id`, `task_id`; строка директора с `private` уходит без слов.

**Пинок** — `kickDeliveries()` через `after()`, отправляет весь готовый хвост очереди. Зовут: `/api/voice/confirm`, `/api/tasks/[id]/transition`, `send-now`, `deadline`, `reassign`, `deadline-request`, `deadline-answer`, `nudge`, `/api/errands`, `/api/visits`, `/api/visits/[id]/answer`, `/api/push/test`. Записи мимо роутов (тред, кнопки секретаря, встречи, магазин, Эфир, досылка из офлайна) зовут `/api/push/kick` через `kickPush()`. Страховка — тик.

**Транспорт** — `RULES` в `lib/push/policy.ts`: по виду события срок жизни у push-сервиса и срочность. Работа (новая задача, доработка, отзыв, сообщение, на приёмку, отказ) — 24 ч, громко; хорошие новости (принято, срок продлён, реакция, готовый заказ) — тихо; «скоро срок» и «скоро встреча» — 1 ч; заявки и визиты секретаря — 20–30 мин; тревога (`meta.urgent`) — 5 мин, громко всегда; вид вне таблицы — 12 ч.

**Окно и тихие часы.** Когда строка может уйти, решает база при вставке, триггером `trg_notification_deliveries_deliver_after`. Всем, кроме директора, — окно компании `settings.delivery_window` (по умолчанию 08:00–21:00 Asia/Aqtobe, D-38): что может подождать (отклик на задачу, сообщения исполнителю, Эфир, календарь, магазин), получает `deliver_after = next_delivery_slot(...)`; новая задача, напоминания о встречах и заметках, заявки и визиты идут сразу. Задача вне окна пуша не рождает: она лежит `scheduled`, тик выпускает её при открытии окна. Директору — его правила «Уведомления» в профиле (`lib/push/prefs.ts`, D-114): режим по категории («Сразу», «Тихо», «Сводкой», «Не присылать»), своя тишина, встречи, важные люди; тревога и системные не настраиваются; `set_notify_prefs` перестраивает ждущую очередь.

**Квитанции** директору (принцип 8): «отправлено» — `sent_at`; «увидел» — `seen_at`; «принял» — `acted_at`. `POST /api/push/seen` шлёт service worker с `delivery_id` при показе уведомления и открытое приложение без id (закрывает все строки человека). «Принял» задачи ставит `/api/tasks/[id]/transition` при переходе в `accepted` строкам `task_sent`; «принял» сообщения — `mark_thread_read`, в том числе из шторки через `/api/push/acted`. Web Push не подтверждает доставку, поэтому индикатор говорит «не открывал с 9:14», а не «не получил» (D-32).

**Канал.** Приложение сверяет подписку при старте (`syncPush()`), service worker на `pushsubscriptionchange` шлёт новый адрес с `replaces`, подписка под чужой VAPID-ключ пересоздаётся (`lib/push/keys.ts`); адрес браузера принадлежит тому, кто в нём вошёл. Мёртвый канал показывает `push_health()`.

## 5. Telegram

Не построен (см. «Не построено»).

## 6. Очки и магазин

Роутов нет, всё — прямые RPC (§3). Баланс — всегда `SUM(point_transactions)` (принцип 4), холд магазина финален (D-10); авто-очки начисляют триггеры и тик.

## 7. Статусная машина задач

`scheduled → sent → accepted → pending_review → done | rework | declined | revoked`; в `in_progress` переходов нет (D-04); «Уточнить» — сообщение с `meta.is_question`. Матрица — в триггере `trg_task_status_guard`; вызов без пользователя (тик) проходит любой из переходов.

| Переход | Кто |
|---|---|
| `scheduled → sent` | тик; директор — `send_task_now` |
| `sent → accepted`, `rework → accepted` | исполнитель |
| `sent`, `accepted → declined` | исполнитель |
| `accepted → pending_review` | исполнитель, отчёт — в той же транзакции |
| `rework → pending_review`, `rework → declined` | исполнитель через `transition_task`, шагами через `accepted` (D-128, D-130) |
| `pending_review → done`, `rework` | директор |
| `declined → sent` | директор («Настоять», G.20) |
| любой, кроме `done` и `revoked`, в `revoked` | директор; `scheduled` при отзыве удаляется |

Остальное — `invalid_transition`, роут отвечает `409`.

## 8. Стена (ТВ)

Роутов нет. Киоск — пользователь роли `tv`, читает RPC `tv_*`; пульт шлёт `tv_control` и `tv_board_control` (абсолютное состояние без ключа, D-76). Визиты поднимают версию стены, тик чистит её ленту.

## 9. Ошибки голосового конвейера

| Состояние | HTTP | Код или тело |
|---|---|---|
| не выдан URL загрузки | 502 | `upload_url_failed` |
| STT не ответил | 502 | `stt_failed` + `audio_path`: повтор по пути |
| не речь | 200 | `code: "empty_transcript"` |
| пустой разбор | 200 | `entities: []` |
| заявка | 200 | `errand`, `model: "matcher"` |
| отказ модели, сбой разбора | 422, 502 | `parse_refused`, `parse_failed` + `transcript` |
| подтверждение с ошибкой | 400 | `assignee_required`, `assignee_inactive`, `event_time_required` |
| повтор подтверждения | 200 | `duplicate: true`, те же id |

`ai_timeout` и `rate_limited` сервер не формирует: так `lib/voice/api.ts` называет ответы `504` и `429` платформы.

## 10. Минутный тик

Cron из `vercel.json` зовёт `/api/push/sweep` (`GET` или `POST`) с `Authorization: Bearer <CRON_SECRET>`, без секрета — `401`; работа под service role. Локально — `pnpm dev:tick`. Шаги по порядку; сбой шага пишется в лог и не останавливает следующие:

1. `daily_reports_due_missed` — первым: утро начинается с закрытого вчера (D-152).
2. `recurrence_spawn` — до выпуска: задача повтора под окно уходит этим же вызовом (D-148).
3. `publish_due_scheduled` — отложенные задачи в `sent` (D-38).
4. `events_due_reminders`, `errands_due_escalation`, `errands_expire`, `errands_due_remind`, `notes_due_reminders`, `notes_purge_trash`, `visits_due_expiry`.
5. Сигналы: `unseen_task_alerts_due`, `overdue_alerts_due`, `deadline_reminders_due`, `daily_report_reminders_due`, `team_channel_alerts_due`, `director_day_summaries_due`, последними `director_digests_due` — придержанный сигнал попадает в сводку (D-114).
6. `notification_deliveries_purge`, `tv_events_prune`.
7. `purgeVoice()` (D-155): `voice_purge_due` до 500 файлов, удаление пачками по 100, `voice_mark_purged` только для пачек без ошибки.
8. `drainStorage()` — файлы удалённых компаний, до 5 с (§14).
9. `sweepDeliveries()` на 40 с: поставленное выше уходит этим же вызовом.

## 11. Переменные окружения в коде

Схема — `serverEnvSchema` в `lib/env.schema.ts`; целиком её проверяет `getServerEnv()`, и зовёт его только воркер пушей. `NEXT_PUBLIC_*` проверяет `getPublicEnv()` без zod (модуль едет в браузер). Остальное читается из `process.env` напрямую. Значения по средам — `docs/SETUP.md`.

| Переменная | Кто читает |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | клиенты Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `createServiceSupabase()`; основа ключей кодов входа и подписи прогонов |
| `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY` | провайдеры STT и разбора |
| `STT_PROVIDER`, `STT_FALLBACK_PROVIDER`, `PARSER_MODEL`, `PARSER_ESCALATION_MODEL` | умолчания, если компания не задала своё |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | воркер пушей |
| `CRON_SECRET`, `LOGIN_CODE_SECRET` | тик; HMAC кодов (без него — производный от service role) |
| `OPS_HOST`, `OPS_APP_ORIGIN` | хост консоли, адрес приложения для её ссылок входа |
| `PULSE_BUILD_ID`, `PULSE_BUILD_SHA`, `PULSE_BUILD_AT` | `/api/version`, ставит `next.config.ts` |

`QUERY_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `INTERNAL_FN_SECRET`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` есть в схеме, но не читаются.

## 12. Наблюдаемость

Ошибки роутов — `console.error` в логи Vercel. `ai_logs` — каждый вызов STT и разбора: модель, время этапов, токены, сущности, `status` (`ok` или `error:<код>`); цену считает «Лаб».

## 13. Вход по коду и сессии

Вход — одноразовый код из 8 цифр на 15 минут (D-135); почта с паролем тоже работает (G.21). База хранит только HMAC кода (`hashCode()`).

**Выдача** — `POST /api/people/[id]/login-code`: себе — любой; человеку своей компании — директор и секретарь по `canResetLogin` (вход директора — только он сам). `issue_login_code` отменяет прежний открытый код. Ответ `201 { code, expires_at, link }` — код есть только здесь; `GET` — состояние последнего кода без кода.

**Вход** — `POST /api/auth/code`, без сессии:

1. Чужой `Origin` — `403` (`sameOrigin()`).
2. `redeem_login_code` принимает HMAC кода и адреса (`hashAddress()`), id устройства и считает попытки по адресу, устройству и всей базе. Неверный, просроченный и использованный код — одно `400 bad_code`; превышение — `429 too_many`.
3. Сессию сервер выпускает сам: `auth.admin.generateLink` с `type: "magiclink"` (письмо не уходит), затем `verifyOtp` через клиент на cookie — сессия ставится cookie этого ответа.
4. Не вышло — код возвращается (`release_login_code`), `502`.

**Отзыв** — `POST /api/people/[id]/sessions`, `revoke_sessions` под личностью вызывающего: сессии, push-подписки и открытые коды человека; себе с `keep_current` — кроме этого телефона. Право решает функция. Увольнение делает то же триггером.

## 14. Консоль разработчиков: сервер

Консоль `/ops` вне компаний (D-157): оператор — пользователь Auth без строки `profiles`, записанный в `ops.operators` командой `pnpm ops:grant <email>`. Контракт — `lib/ops/contract.ts`; устройство схемы `ops` — шапка миграции `20261104130000_ops_console.sql`.

**Сессия** — своя cookie `pulse-ops-auth`, не касается сессии компании. `/api/ops/auth/login` проверяет пароль на клиенте без cookie и сохраняет сессию только оператору; затем `enroll` (один TOTP-фактор) или `verify` (сессия становится `aal2`, свежесть кода обновляется). С `OPS_HOST` консоль отвечает только на этом хосте.

**Роут** — `withOps(spec, fn)` (`lib/ops/handler.ts`): по очереди хост, `Origin` на любой не-GET, клиент на cookie консоли, zod, ворота, `fn`. Ворота: `open` — шаги входа; `read` — чтения `ops_*` под JWT, каждая начинается с `ops.assert`; `operator` — проверка оператора перед service-only функциями без билета; действие — `ops_ticket` под JWT проверяет оператора, свежесть TOTP и причину и выдаёт билет на 60 с, который гасит пишущая `ops_*` под service role. Без сессии оператора билета нет, поэтому забытая проверка в роуте не становится дырой. Действие несёт `reason` и `client_request_id`; повтор отвечает из журнала `ops.audit`. Ошибки базы переводит `opsFailure()`: `ops_denied` — `401`, `ops_fresh_required` — `428` (клиент спрашивает код и повторяет), `ops_bad_ticket` — `409`. Правки консоли пушей не шлют.

| Путь | Метод | Ворота, действие |
|---|---|---|
| `/api/ops/auth/login`, `enroll`, `verify`, `logout` | POST | `open` |
| `/api/ops/me` | GET | `operator` |
| `/api/ops/operators`, `/api/ops/audit` | GET | `read` |
| `/api/ops/companies` | GET, POST | `read`; `create_company` (директор, киоск, код) |
| `/api/ops/companies/[id]` | GET, PATCH | `read`; `update_company` |
| `/api/ops/companies/[id]/footprint` | GET | `read` |
| `/api/ops/companies/[id]/people`, `director`, `task-lookup` | POST | `add_person`, `change_director`, `task_lookup` |
| `/api/ops/companies/[id]/wipe`, `export`, `purge` | POST | `wipe_activity`, `export_company`, `purge_company` |
| `/api/ops/exports/[id]/page`, `files`, `finish` | GET, GET, POST | `operator` |
| `/api/ops/people/[id]` | PATCH | `update_person` |
| `/api/ops/people/[id]/login-code`, `sessions`, `points` | POST | `issue_login_code`, `revoke_sessions`, `adjust_points` |
| `/api/ops/tasks/[id]`, `/api/ops/tasks/[id]/delete` | PATCH, POST | `update_task`, `delete_task` |
| `/api/ops/storage/drain` | POST | `operator` |

Выгрузку ведёт браузер: после `export` он забирает страницы строк и файлов, затем `finish` с хэшем. Файлы стёртых и удалённых компаний встают в очередь; её разбирают `wipe` и `purge` сразу, тик и `/api/ops/storage/drain`.

## Не построено

- Telegram как гарантийный ярус с эскалацией (D-21): колонку `telegram_chat_id` в `profiles` никто не пишет.
- Канал SMS (D-21): только значение в enum канала.
- Вопросы к данным моделью: вид `query` уходит в `skipped`, ответы на Пульсе детерминированные (D-51).
- Web Share Target (D-36): `parse` принимает `source: shared`, входа нет.

## Известные ограничения

- Тик на стенде идёт раз в сутки (`0 3 * * *`, 08:00 Asia/Aqtobe): Vercel Hobby (В-8, D-125). Всё, что ждёт времени, ждёт утра; пуши после мутаций уходят сразу пинком.
- Не каждая мутация пинает: отзыв задачи и запись из браузера без `kickPush()` ждут чужого пинка или тика.
- Воркер пушей проверяет весь серверный env: без `OPENAI_API_KEY` или `ANTHROPIC_API_KEY` он падает, и пуши не уходят вовсе.
- Ошибки не собираются: только логи Vercel, Sentry и алертов нет.
