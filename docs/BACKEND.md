# BACKEND.md — API, голосовой конвейер, push, ТВ-пульт

Бэкенд = Next.js route handlers (`/app/api/*`) + Supabase Edge Functions (для webhook'ов и cron-логики). Service role key — только здесь.

## 1. Голосовой конвейер (главный флоу)

### POST /api/voice/transcribe
Вход: аудио (webm/opus или m4a, из MediaRecorder), user_id из сессии.
1. Сохранить аудио в Storage `voice/` СРАЗУ (до любых AI-вызовов — голосовое не должно теряться при сбое).
2. Whisper API (`language: ru`). Ретрай ×2 с backoff.
3. Вернуть `{ audio_url, transcript }`.

### POST /api/voice/parse
Вход: `{ transcript, audio_url?, source: 'voice'|'typed'|'shared' }`. Текстовый ввод и Web Share Target идут сюда же, минуя transcribe — один парсер на все входы. Claude `claude-haiku-4-5`, structured JSON. Поле source писать в ai_logs — для анализа, каким входом директор реально пользуется. В few-shot включить примеры телеграфного стиля («марат кп казхром завтра до обеда, ерлану +10»).

**Системный промпт парсера (ядро, дорабатывать на реальных фразах):**
- Контекст: список сотрудников `{id, full_name, aliases, position}` компании (инжектится в промпт), текущая дата/время Asia/Aqtobe.
- Задача: разбить транскрипт на массив сущностей:
```json
{ "entities": [
  {"kind":"announcement","text":"..."},
  {"kind":"task","assignee_query":"Марат","title":"...","body":"...",
   "deadline_iso":"...","priority":"high","scheduled_send_at":null},
  {"kind":"points","assignee_query":"Ерлан","amount":10,"reason":"за скорость"},
  {"kind":"reminder","text":"...","remind_at_iso":"..."},
  {"kind":"recurrence","assignee_query":"Айгуль","title":"...","rrule":"FREQ=WEEKLY;BYDAY=MO"},
  {"kind":"delegation","assignee_query":"Ерлан","title":"...","note":"распределить в группе"}
]}
```
- Правила промпта: «завтра до обеда» → конкретный ISO (13:00 след. дня); «утром отправь» → scheduled_send_at 08:00; ничего не выдумывать — если исполнитель/дедлайн не назван, поле null; ответ — ТОЛЬКО JSON.

### Матчинг исполнителя (lib/matchName.ts)
`assignee_query` → поиск по full_name + aliases: точное совпадение → одно; fuzzy (напр. Левенштейн/трிграммы, порог) → если 1 кандидат с большим отрывом — авто; если 2–3 близких — вернуть варианты, фронт покажет выбор тапом; 0 — пометить «не распознан». Никогда не назначать «наугад».

### POST /api/voice/confirm
Вход: подтверждённые директором сущности (после экрана подтверждения, возможно с правками тапом).
Одна транзакция: insert announcements / tasks / point_transactions / reminders / recurrence_rules → триггеры push. Идемпотентность через client_request_id.

### POST /api/voice/query — голосовые вопросы к системе
Claude с tool use. Инструменты (все — обёртки над Supabase с RLS-контекстом директора):
- `search_tasks(query, assignee?, status?)` — ilike/фуллтекст по title/body.
- `employee_tasks(user_id)`, `who_not_reported(period)`, `overdue_list()`, `summary_today()`.
Ответ — короткий текст на русском + структурированные карточки (фронт рендерит списком). Максимум 3–4 tool-вызова на запрос.

## 2. Push-уведомления

- `web-push` + VAPID. Подписки в push_subscriptions (при logout/410 — удалять endpoint).
- Триггер: Postgres trigger на tasks/task_messages → `pg_net` http-вызов Edge Function `send-push` (или Database Webhooks). Edge Function читает подписки адресата и шлёт.
- Payload: `{title, body, tag: task_id, url: deep-link}` — тап открывает конкретную задачу.
- Fallback Telegram: если у пользователя нет активных подписок, но есть telegram_chat_id → grammY sendMessage с inline-кнопками «Принял/Вопрос» → callback webhook (Edge Function `tg-webhook`) пишет статус в БД. Telegram — резерв, не основной канал.

## 3. Очки и реакции

- POST /api/points — только role=director; валидировать amount ≠ 0, reason обязателен при amount < 0.
- Авто-правила: cron-джоб просрочек и триггер на смену статуса (done в срок/досрочно, accepted < 10 мин) → insert point_transactions source='auto_rule'. Идемпотентно: unique-ключ (task_id, rule_code).
- POST /api/reactions — insert reaction + push сотруднику; если emoji в company.settings.reaction_points → транзакция source='reaction'.

## 4. Магазин

- POST /api/shop/order: проверка баланса (SUM ≥ price) и stock > 0 **в одной SQL-транзакции** с insert order + point_transaction(shop_hold, −price) + decrement stock. Гонки исключить (select ... for update на stock).
- POST /api/shop/order/:id/approve|deliver|cancel — роли director/shopkeeper; cancel → компенсирующая транзакция shop_release + возврат stock.

## 5. ТВ-пульт

- Supabase Realtime broadcast-канал `tv_control:{company_id}`.
- Телефон директора публикует: `{mode:'ether'|'employee_focus'|'task_focus'|'week_summary'|'compare', employee_id?, task_id?, ids?}`.
- `/tv` слушает канал; авто-возврат в 'ether' через 10 минут без команд (таймер на клиенте ТВ).
- Права: публиковать в канал может только director (проверка через RLS on realtime / серверный прокси-endpoint POST /api/tv/control).

## 6. Cron-логика (Edge Functions по pg_cron, см. DATABASE.md)

- `daily-summary`: 18:00 — собрать цифры дня → push директору (+ позже TTS: аудиофайл в Storage, ссылка в push).
- `scheduled-send`: публикация отложенных задач.
- `recurrence-runner`: создание задач по правилам.
- `overdue-checker`: пометка просрочек + авто-штраф + событие в task_messages(system).

## 7. Обработка ошибок AI

- Whisper упал → аудио уже в Storage; вернуть фронту `{audio_url, transcript:null}` — фронт покажет «Не расслышал, отправить ещё раз?» с ретраем без перезаписи.
- Claude вернул невалидный JSON → один автоматический repair-retry с сообщением об ошибке парсинга; после второй неудачи — показать директору сырой транскрипт с кнопкой «Повторить».
- Все AI-вызовы логировать (без аудио) в таблицу ai_logs: latency, model, ok/fail — для последующего анализа реальных паттернов директора.
