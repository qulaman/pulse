# SETUP.md — среды, секреты, bootstrap, провижининг клиента

Что это: контракт по инфраструктуре продукта Pulse — среды, секреты, развёртывание и флот изолированных инстансов (V-02); для того, кто разворачивает и сопровождает инстансы. Арбитр — `DECISIONS.md` (D-19 среды, V-02 инстанс-на-клиента, разделы G/H); при расхождении DECISIONS.md > этот файл. Схема БД — `docs/DATABASE.md`; API и минутный тик — `docs/BACKEND.md`. Метки: `[есть]`, `[не построено]`; план без метки — контракт.

## 1. Среды инстанса клиента №1 (D-19)

Продукт живёт изолированными инстансами (V-02): у каждого клиента свой Supabase-проект и свой деплой, провижининг — §5. До второго клиента флот — это dev + prod инстанса клиента №1; план D-19 — два проекта Supabase с первого дня. Сейчас есть только dev (D-19 🔴).

| Среда | Supabase | Регион | Тариф | Vercel |
|---|---|---|---|---|
| **dev** `[есть]` | `pulse-dev` | Франкфурт (`eu-central-1`) | Free | все preview-деплои (ветки/PR) |
| **prod** `[не построено]` | `pulse-prod` | Франкфурт (`eu-central-1`) | Pro (PITR) | production (ветка `main`) |

Регион Франкфурт обязателен для инстанса клиента №1 (закон РК о ПД, H.13: пилот = Франкфурт + письменные согласия); регион инстанса другого клиента — его юрисдикция (§5). Один Vercel-проект: env-переменные разнесены по скоупам Preview/Production, preview всегда смотрит в dev-Supabase.

**Правило миграций (нарушение = инцидент):**

1. Пишем миграцию локально в `/supabase/migrations` (`YYYYMMDDHHMMSS_описание.sql`, одна миграция = одна фича, старые не правятся).
2. Прогоняем в dev: `pnpm db:push` (`supabase db push` в слинкованный dev-проект).
3. В prod — **только из CI по merge в `main`** (`supabase migration up` с `SUPABASE_ACCESS_TOKEN` + `--db-url` прод-инстанса из секретов CI) — `[не построено]`: CI нет (`.github/` нет), prod нет (D-19).
4. **`supabase db push` в прод запрещён.** Ручной прогон миграций в прод с ноутбука запрещён. При флоте инстансов (V-02) CI катит на все — см. §5.

## 2. Env-переменные

`.env.example` в корне репозитория **обязателен**: все имена переменных с комментариями, без значений. Новая переменная без строки в `.env.example` не проходит ревью. Проверка схемы env — `lib/env.schema.ts`.

| Переменная | Где живёт | dev | prod | Примечание |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (Preview/Prod), `.env.local` | URL pulse-dev | URL pulse-prod | публичная |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | там же | anon dev | anon prod | публичная |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel server-only, `.env.local` | dev key | prod key | **только сервер, никогда в клиент/NEXT_PUBLIC** |
| `SUPABASE_ACCESS_TOKEN` | только `.env.local` | свой | — | personal access token Supabase CLI (или `supabase login`); в Vercel не нужен |
| `SUPABASE_DB_PASSWORD` | только `.env.local` | пароль dev-БД | — | для `db push` / `db reset --linked` слинкованного dev-проекта; в Vercel не нужен |
| `OPENAI_API_KEY` | Vercel server-only | общий или отдельный | отдельный prod-ключ | STT (`gpt-4o-transcribe`, D-39) |
| `ANTHROPIC_API_KEY` | Vercel server-only | общий или отдельный | отдельный prod-ключ | парсер, `claude-haiku-4-5` и эскалация |
| `STT_PROVIDER` | Vercel | `openai` | `openai` | по D-48 — дефолт инстанса под `company.settings.stt`; фактически `/api/voice/transcribe` берёт провайдера только из `settings.stt` (zod-дефолт `openai`), env читает `transcribe()` без настроек (вопрос — WORKLOG 2026-09-23, 018f) |
| `STT_FALLBACK_PROVIDER` | Vercel | пусто | пусто | запасной STT-провайдер; так же, как `STT_PROVIDER`, — под `settings.stt.fallback` |
| `DEEPGRAM_API_KEY` | Vercel server-only | по желанию | по желанию | STT-провайдер `deepgram` (`nova-3`) |
| `ELEVENLABS_API_KEY` | Vercel server-only | по желанию | по желанию | STT-провайдер `elevenlabs` (`scribe_v2`), роль — fallback (D-53) |
| `DEEPSEEK_API_KEY` | Vercel server-only | по желанию | по желанию | экспериментальный парсер `deepseek-*` для «Лаб» (D-63) |
| `PARSER_MODEL` | Vercel | пусто | пусто | модель парсера; в приложении её задаёт `settings.parser.model` (дефолт `claude-haiku-4-5`), env читает `pnpm eval:parser` |
| `PARSER_ESCALATION_MODEL` | Vercel | пусто | пусто | модель эскалации; в приложении — `settings.parser.escalation_model` (дефолт `claude-sonnet-5`), env читает `pnpm eval:parser` |
| `QUERY_MODEL` | Vercel | — | — | `[не построено]` — ассистент вопросов к данным (этап 3, AI.md §7) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel | **своя пара dev** | **своя пара prod** | см. предупреждение ниже |
| `VAPID_PRIVATE_KEY` | Vercel server-only | пара dev | пара prod | |
| `VAPID_SUBJECT` | Vercel | `mailto:...` | `mailto:...` | контактный email |
| `CRON_SECRET` | Vercel server-only, `.env.local` | свой | свой | секрет минутного тика: `/api/push/sweep` сверяет `Authorization: Bearer <CRON_SECRET>`, без него — 401 (§3, шаг 7) |
| `DEMO_RESET_ENABLED` | Vercel server-only (Preview), `.env.local` | `1` | **не задавать** | замок кнопки «Обнулить демо-базу» (`POST /api/admin/reset-demo`, стирает активность компании, людей и настройки оставляет); без него роут отвечает 403 |
| `NEXT_PUBLIC_DEMO_MODE` | Vercel (Preview), `.env.local` | `1` | **не задавать** | показывает раздел «Демо» в Настройках; решает всё равно серверный замок |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | — | — | — | зарезервировано: Telegram-ярус `[не построено]` (D-21); план — свой бот на каждую среду, `secret_token` вебхука |
| `INTERNAL_FN_SECRET` | — | — | — | зарезервировано: вызовы pg_net → Edge Functions `[не построено]` (G.20c) |
| `SENTRY_DSN` (+`NEXT_PUBLIC_SENTRY_DSN`) | — | — | — | зарезервировано: Sentry `[не построено]` (§6) |

**⚠️ VAPID: отдельные пары на среду, смена ключей убивает подписки.** Push-подписка браузера криптографически привязана к публичному VAPID-ключу. Замена пары в prod = **все** существующие подписки сотрудников мертвы, каждому нужна переподписка на устройстве. Поэтому: (а) dev и prod никогда не делят пару; (б) прод-пара генерируется один раз и ротируется только при компрометации, с осознанным планом переподписки (push-уведомление не доставить — оповещение через Telegram-канал доставки, `[не построено]`).

## 3. Bootstrap с нуля (пошагово)

Предусловия: Node 20+, pnpm, Supabase CLI, аккаунты Supabase/Vercel/OpenAI/Anthropic.

1. **Репозиторий:** `git clone` → `pnpm install`. Скопировать `.env.example` → `.env.local`, заполнять по ходу шагов.
2. **Supabase-проекты:** создать `pulse-dev` (Free) и `pulse-prod` (Pro) в регионе Франкфурт (prod — `[не построено]`, D-19). `supabase login` → `supabase link --project-ref <dev-ref>` (локальная работа всегда слинкована на dev).
3. **Миграции:** `pnpm db:push` в dev. Проверить: таблицы, RLS включён на каждой. pg_cron-джобов нет — единственный планировщик — Vercel cron (шаг 7).
4. **Демо-состояние:** `pnpm db:clean` — стирает задачи/сообщения/очки/логи/черновики и smoke-логины dev-проекта, людей и настройки оставляет (для показа); `pnpm db:reset` возвращает полный seed для pgTAP. **Seed:** прогнать `supabase/seed.sql` в dev (демо-компания, «два Ерлана», задачи во всех статусах — контракт сида в DATABASE.md). **В prod seed не катится никогда** — прод наполняется анкетой клиента (§5).
5. **VAPID:** `npx web-push generate-vapid-keys` — дважды (dev-пара и prod-пара). Разложить по скоупам Vercel.
6. **Vercel:** `vercel link` → env-переменные из таблицы §2 по скоупам (Preview → dev-значения, Production → prod-значения) → `git push` ветки = preview-деплой на dev-данных → merge в `main` = production.
7. **Минутный тик:** `vercel.json` объявляет один cron — `/api/push/sweep` каждую минуту (**сейчас — раз в сутки**, `0 3 * * *` = 08:00 Asia/Aqtobe: проект `pulse` в Vercel на Hobby, домен `pulse-blond-one.vercel.app`, Production и Preview смотрят в dev-Supabase — WORKLOG 2026-09-25; на Pro вернуть `* * * * *`); он же гонит `events_due_reminders` и `errands_due_escalation` (BACKEND.md). Задать `CRON_SECRET` в env Vercel — роут сверяет `Authorization: Bearer <CRON_SECRET>`. Роут принимает и `GET` (так зовёт cron Vercel), и `POST`; тот же тик выпускает отложенные задачи и считает сигналы директора (D-114). Cron раз в минуту — тариф Vercel Pro (на Hobby — раз в сутки). Локально cron нет: рядом с `pnpm dev` запускать `pnpm dev:tick`. **Порядок выкатки D-114: миграции — до кода**: воркер без `claim_deliveries` не отправит ни одного пуша.
8. **Telegram-боты, вебхук, секреты Edge Functions** — `[не построено]` (D-21, G.20c): `supabase/functions` нет. План: у @BotFather **два** бота — `pulse_dev_bot` и рабочий (имя по D-20), один бот на две среды запрещён (вебхук у бота один, dev-эксперименты будут воровать апдейты у прода); после деплоя функции `tg-webhook` — `setWebhook` на её URL с `secret_token=$TELEGRAM_WEBHOOK_SECRET`; `supabase secrets set` в обоих проектах: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `INTERNAL_FN_SECRET`.
9. **Смоук-чек-лист после первого деплоя** (на реальном телефоне, не эмуляторе):
    - [ ] логин сид-пользователем (director), Пульс открывается;
    - [ ] подписка на push + тестовый push доходит (телефон заблокирован);
    - [ ] голосовое → транскрипт → карточки подтверждения на доске Пульса → задача у сотрудника;
    - [ ] Telegram: `/start` по deep-link связывает chat_id, эскалация стреляет — `[не построено]`;
    - [ ] Sentry получает тестовое событие — `[не построено]`.

## 4. Секреты: правила

- Секреты живут **только** в env (Vercel env, Supabase secrets/Vault, секреты CI). В коде, коммитах, логах, `ai_logs`, клиентском бандле — никогда. `NEXT_PUBLIC_*` — только заведомо публичное (URL, anon key, VAPID public).
- `SUPABASE_SERVICE_ROLE_KEY` — только серверный код (route handlers; Edge Functions — `[не построено]`). Импорт серверного supabase-клиента из клиентского кода — ошибка сборки (обёртка с `server-only`).
- **Ротация:** AI-ключи и `INTERNAL_FN_SECRET` — по календарю раз в квартал и при любом подозрении; VAPID — только при компрометации (см. §2).
- **При утечке:** (1) немедленно отозвать/перевыпустить ключ у провайдера (Supabase: rotate service role; OpenAI/Anthropic: revoke; BotFather: `/revoke`); (2) обновить env во всех средах и секретах CI, редеплой; (3) если ключ был в git — вычистить историю (BFG) и считать утёкшим навсегда; (4) проверить логи провайдера на чужое использование; (5) записать инцидент (что, когда, чем закрыт) в `DECISIONS.md` или журнал инцидентов.

## 5. Провижининг клиента (V-02): инстанс под ключ за 1 день

Каждый клиент = свой Supabase-проект + свой Vercel-проект/поддомен + свои боты. Общей БД нет. Всё скриптуется. Сейчас есть только шаг 3 — `pnpm seed:client` (`scripts/seed-client.ts`, образец анкеты `scripts/client.example.json`); оркестратор `scripts/provision-client.ts` — `[не построено]`, ниже — эскиз его контракта:

```
Вход: анкета клиента client.json
  сейчас (seed-client): { slug, company_name, settings{...}, director{...}, tv{...}, employees[] }  // settings → company.settings
  провижининг добавит: region, domain
Шаги (идемпотентно, с чекпоинтами — повторный запуск продолжает):
  1. supabase projects create pulse-<slug> --region <region>   # юрисдикция клиента — аргумент продажи
  2. supabase migration up --db-url <new-project>              # ВСЕ миграции с нуля
  3. [есть] seed компании — `pnpm seed:client <анкета.json>` (цель — проект из .env.local;
     `--dry-run` показывает план, `--undo` откатывает ровно анкету; идемпотентен; алиасы подсказываются по D-54;
     пароли без значения в анкете генерируются и печатаются один раз): insert company (settings из анкеты), профили из employees[],
     служебный tv-пользователь; демо-данные НЕ сеются
  4. vercel project create pulse-<slug> + домен/поддомен клиента
  5. env: генерация VAPID-пары и CRON_SECRET (плюс TELEGRAM_WEBHOOK_SECRET, INTERNAL_FN_SECRET — когда появятся Telegram и Edge Functions);
     прокладка всех переменных §2 (Vercel env + supabase secrets)
  6. Telegram-бот клиента у BotFather (ручной шаг — API нет; скрипт ждёт токен),
     setWebhook — [не построено], D-21
  7. деплой + запись инстанса в fleet.json
Выход: URL инстанса + отчёт по чек-листу приёмки
```

**Чек-лист приёмки инстанса** (перед передачей клиенту, см. также TESTING.md §7):
- [ ] миграции: версия схемы = HEAD `main`;
- [ ] RLS-тесты (pgTAP) прогнаны на инстансе — зелёные;
- [ ] смоук §3 (шаг 9) пройден на устройстве;
- [ ] company.settings соответствует анкете (тихие часы, правила очков, rating_mode);
- [ ] бэкапы включены (§7), Sentry-окружение заведено (§6, `[не построено]`);
- [ ] в коде инстанса нет клиент-специфики — конфиг только settings/env (принцип 6 CLAUDE.md).

**Фан-аут миграций на флот (CI, эскиз) — `[не построено]`:** `fleet.json` — реестр инстансов `[{slug, supabase_ref, db_url_secret, vercel_project}]`. CI-джоб на merge в `main`: цикл по fleet.json → `supabase migration up` на каждый инстанс → отчёт «инстанс × версия миграций»; упавший инстанс не блокирует остальные, но алертит (§6). Ручной прогон на инстанс клиента запрещён так же, как в prod.

До второго клиента флот = dev + prod инстанса клиента №1 (D-19), fleet.json содержит один prod.

## 6. Наблюдаемость

- **Sentry — `[не построено]`** (`@sentry/nextjs` в зависимостях нет): план — клиент + route handlers, окружения `dev`/`production`/`client-<slug>`. Соло-разработчик без алертов узнаёт о падении пушей от директора — недопустимо.
- **Алерты — `[не построено]`:** рост `status='failed'` в `notification_deliveries` (порог: >5 за 15 мин); `status like 'error:%'` в `ai_logs` (порог: >3 подряд или >10% за час); любой необработанный exception в prod — сразу. Канал — Telegram/почта разработчика. Еженедельный `push_health`-отчёт «у кого канал мёртв» — `[не построено]` (pg_cron нет).
- **Vercel Analytics / Web Vitals — `[не построено]`** (пакетов `@vercel/analytics`, `@vercel/speed-insights` нет): Web Vitals с реальных бюджетных Android важнее лабораторных замеров.
- Дашборд-минимум (SQL по ai_logs): p50/p90 «голос → карточка» (метрика D-43), доля правок (стоп-сигнал D-35, сейчас — `pnpm eval:harvest`) — `[не построено]`; стоимость каждого разбора и STT `[есть]` — страница `/lab` (D-63).

## 7. Бэкапы и восстановление

- **prod** `[не построено]` (D-19): Supabase Pro — ежедневные автодампы + включить **PITR** (retention ≥ 7 дней). dev — без гарантий, всё восстановимо из миграций+seed.
- **Storage** в автодампы БД не входит: аудио/фото — отдельная периодическая выгрузка (скрипт по бакетам) либо осознанно принятый риск, зафиксированный здесь. Срок хранения аудио (рекомендация D-18 — 12 месяцев, джоб `audio_retention` чистит `voice` и обнуляет `audio_path`; транскрипты — вечно) — `[не построено]`: аудио копится бессрочно (D-18 ◐, D-66 п.6).
- **Проверка восстановления — раз в месяц, по календарю** (с появлением prod): восстановить прод-дамп в пустой временный проект → прогнать смоук §3 (шаг 9) логином + 2–3 запроса (баланс очков = SUM, лента задач) → удалить проект → отметить дату и результат. Бэкап, который ни разу не восстанавливали, бэкапом не считается.
- При флоте (V-02): бэкап-политика — часть провижининга (§5, чек-лист); ежемесячная проверка — ротацией по одному инстансу из флота.
