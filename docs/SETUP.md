# SETUP.md — среды, секреты, bootstrap, провижининг клиента

Что это: контракт по инфраструктуре продукта Pulse — среды, секреты, развёртывание и флот изолированных инстансов (V-02); для того, кто разворачивает и сопровождает инстансы. Арбитр — `DECISIONS.md` (D-19 среды, V-02 инстанс-на-клиента, разделы G/H); при расхождении DECISIONS.md > этот файл. Схема БД и cron — `docs/DATABASE.md`; API — `docs/BACKEND.md`.

## 1. Среды инстанса клиента №1 (D-19)

Продукт живёт изолированными инстансами (V-02): у каждого клиента свой Supabase-проект и свой деплой, провижининг — §5. До второго клиента флот — это dev + prod инстанса клиента №1; два проекта Supabase с первого дня:

| Среда | Supabase | Регион | Тариф | Vercel |
|---|---|---|---|---|
| **dev** | `pulse-dev` | Франкфурт (`eu-central-1`) | Free | все preview-деплои (ветки/PR) |
| **prod** | `pulse-prod` | Франкфурт (`eu-central-1`) | Pro (PITR) | production (ветка `main`) |

Регион Франкфурт обязателен для инстанса клиента №1 (закон РК о ПД, H.13: пилот = Франкфурт + письменные согласия); регион инстанса другого клиента — его юрисдикция (§5). Один Vercel-проект: env-переменные разнесены по скоупам Preview/Production, preview всегда смотрит в dev-Supabase.

**Правило миграций (нарушение = инцидент):**

1. Пишем миграцию локально в `/supabase/migrations` (`YYYYMMDDHHMMSS_описание.sql`, одна миграция = одна фича, старые не правятся).
2. Прогоняем в dev: `supabase migration up` (проект слинкован на dev).
3. В prod — **только из CI по merge в `main`** (тот же `supabase migration up` с `SUPABASE_ACCESS_TOKEN` + `--db-url` прод-инстанса из секретов CI).
4. **`supabase db push` в прод запрещён.** Ручной прогон миграций в прод с ноутбука запрещён. При флоте инстансов (V-02) CI катит на все — см. §5.

## 2. Env-переменные

`.env.example` в корне репозитория **обязателен**: все имена переменных с комментариями, без значений. Новая переменная без строки в `.env.example` не проходит ревью.

| Переменная | Где живёт | dev | prod | Примечание |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (Preview/Prod), `.env.local` | URL pulse-dev | URL pulse-prod | публичная |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | там же | anon dev | anon prod | публичная |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel server-only + Edge Functions secrets | dev key | prod key | **только сервер, никогда в клиент/NEXT_PUBLIC** |
| `OPENAI_API_KEY` | Vercel server-only | общий или отдельный | отдельный prod-ключ | STT (`gpt-4o-transcribe`, D-39) |
| `ANTHROPIC_API_KEY` | Vercel server-only | общий или отдельный | отдельный prod-ключ | парсер/query, `claude-haiku-4-5` |
| `STT_PROVIDER` | Vercel | `openai` | `openai` | сменный интерфейс `transcribe()`; альтернативы по итогам СТТ-гейта |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel | **своя пара dev** | **своя пара prod** | см. предупреждение ниже |
| `VAPID_PRIVATE_KEY` | Vercel server-only | пара dev | пара prod | |
| `VAPID_SUBJECT` | Vercel | `mailto:...` | `mailto:...` | контактный email |
| `TELEGRAM_BOT_TOKEN` | Vercel server-only + Edge Functions secrets | токен **dev-бота** | токен **prod-бота** | боты разные, см. §3 |
| `TELEGRAM_WEBHOOK_SECRET` | Edge Functions secrets | свой | свой | `secret_token` вебхука, сверяется в `tg-webhook` |
| `INTERNAL_FN_SECRET` | Supabase (Vault/настройка БД) + Edge Functions secrets | свой | свой | заголовок `x-internal-secret` для вызовов pg_net → Edge Functions; функции без него отвечают 401 |
| `SENTRY_DSN` (+`NEXT_PUBLIC_SENTRY_DSN`) | Vercel | dev-проект Sentry или пусто | prod-проект Sentry | §6 |

**⚠️ VAPID: отдельные пары на среду, смена ключей убивает подписки.** Push-подписка браузера криптографически привязана к публичному VAPID-ключу. Замена пары в prod = **все** существующие подписки сотрудников мертвы, каждому нужна переподписка на устройстве. Поэтому: (а) dev и prod никогда не делят пару; (б) прод-пара генерируется один раз и ротируется только при компрометации, с осознанным планом переподписки (push-уведомление не доставить — оповещение через Telegram-канал доставки).

## 3. Bootstrap с нуля (пошагово)

Предусловия: Node 20+, pnpm, Supabase CLI, аккаунты Supabase/Vercel/OpenAI/Anthropic/Sentry, Telegram.

1. **Репозиторий:** `git clone` → `pnpm install`. Скопировать `.env.example` → `.env.local`, заполнять по ходу шагов.
2. **Supabase-проекты:** создать `pulse-dev` (Free) и `pulse-prod` (Pro) в регионе Франкфурт. `supabase login` → `supabase link --project-ref <dev-ref>` (локальная работа всегда слинкована на dev).
3. **Миграции:** `supabase migration up` в dev. Проверить: таблицы, RLS включён на каждой, pg_cron-джобы из DATABASE.md созданы.
4. **Демо-состояние:** `pnpm db:clean` — стирает задачи/сообщения/очки/логи/черновики и smoke-логины dev-проекта, людей и настройки оставляет (для показа); `pnpm db:reset` возвращает полный seed для pgTAP. **Seed:** прогнать `supabase/seed.sql` в dev (демо-компания, «два Ерлана», задачи во всех статусах — контракт сида в DATABASE.md). **В prod seed не катится никогда** — прод наполняется анкетой клиента (§5).
5. **VAPID:** `npx web-push generate-vapid-keys` — дважды (dev-пара и prod-пара). Разложить по скоупам Vercel.
6. **Telegram-боты:** у @BotFather создать **двух** ботов — `pulse_dev_bot` и рабочий (имя по D-20). Токены — в env соответствующих сред. Один бот на две среды запрещён: вебхук у бота один, dev-эксперименты будут воровать апдейты у прода.
7. **Вебхук:** после первого деплоя Edge Function `tg-webhook` — `setWebhook` на её URL с `secret_token=$TELEGRAM_WEBHOOK_SECRET` (для каждой среды свой бот → свой URL → свой секрет).
8. **Секреты Edge Functions:** `supabase secrets set` в обоих проектах: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `INTERNAL_FN_SECRET`, ключи AI при необходимости. `INTERNAL_FN_SECRET` также положить в настройку БД (Vault), чтобы pg_net формировал заголовок.
9. **Vercel:** `vercel link` → env-переменные из таблицы §2 по скоупам (Preview → dev-значения, Production → prod-значения) → `git push` ветки = preview-деплой на dev-данных → merge в `main` = production.
10. **Смоук-чек-лист после первого деплоя** (на реальном телефоне, не эмуляторе):
    - [ ] логин сид-пользователем (director), Пульс открывается;
    - [ ] подписка на push + тестовый push доходит (телефон заблокирован);
    - [ ] голосовое → транскрипт → карточка на /confirm → задача у сотрудника;
    - [ ] Telegram: `/start` по deep-link связывает chat_id, эскалация стреляет;
    - [ ] Sentry получает тестовое событие.

## 4. Секреты: правила

- Секреты живут **только** в env (Vercel env, Supabase secrets/Vault, секреты CI). В коде, коммитах, логах, `ai_logs`, клиентском бандле — никогда. `NEXT_PUBLIC_*` — только заведомо публичное (URL, anon key, VAPID public).
- `SUPABASE_SERVICE_ROLE_KEY` — только серверный код (route handlers, Edge Functions). Импорт серверного supabase-клиента из клиентского кода — ошибка сборки (обёртка с `server-only`).
- **Ротация:** AI-ключи и `INTERNAL_FN_SECRET` — по календарю раз в квартал и при любом подозрении; VAPID — только при компрометации (см. §2).
- **При утечке:** (1) немедленно отозвать/перевыпустить ключ у провайдера (Supabase: rotate service role; OpenAI/Anthropic: revoke; BotFather: `/revoke`); (2) обновить env во всех средах и секретах CI, редеплой; (3) если ключ был в git — вычистить историю (BFG) и считать утёкшим навсегда; (4) проверить логи провайдера на чужое использование; (5) записать инцидент (что, когда, чем закрыт) в `DECISIONS.md` или журнал инцидентов.

## 5. Провижининг клиента (V-02): инстанс под ключ за 1 день

Каждый клиент = свой Supabase-проект + свой Vercel-проект/поддомен + свои боты. Общей БД нет. Всё скриптуется — `scripts/provision-client.ts` (эскиз контракта):

```
Вход: анкета клиента client.json
  { slug, company_name, region, domain, employees[], settings{...} }  // settings → company.settings
Шаги (идемпотентно, с чекпоинтами — повторный запуск продолжает):
  1. supabase projects create pulse-<slug> --region <region>   # юрисдикция клиента — аргумент продажи
  2. supabase migration up --db-url <new-project>              # ВСЕ миграции с нуля
  3. seed компании — `pnpm seed:client <анкета.json>` (scripts/seed-client.ts, образец scripts/client.example.json;
     `--dry-run` показывает план, `--undo` откатывает ровно анкету; идемпотентен; алиасы подсказываются по D-54;
     пароли без значения в анкете генерируются и печатаются один раз): insert company (settings из анкеты), профили из employees[],
     служебный tv-пользователь; демо-данные НЕ сеются
  4. vercel project create pulse-<slug> + домен/поддомен клиента
  5. env: генерация VAPID-пары, INTERNAL_FN_SECRET, TELEGRAM_WEBHOOK_SECRET;
     прокладка всех переменных §2 (Vercel env + supabase secrets)
  6. Telegram-бот клиента у BotFather (ручной шаг — API нет; скрипт ждёт токен),
     setWebhook
  7. деплой + запись инстанса в fleet.json
Выход: URL инстанса + отчёт по чек-листу приёмки
```

**Чек-лист приёмки инстанса** (перед передачей клиенту, см. также TESTING.md §7):
- [ ] миграции: версия схемы = HEAD `main`;
- [ ] RLS-тесты (pgTAP) прогнаны на инстансе — зелёные;
- [ ] смоук §3.10 пройден на устройстве;
- [ ] company.settings соответствует анкете (тихие часы, правила очков, rating_mode);
- [ ] бэкапы включены (§7), Sentry-окружение заведено (§6);
- [ ] в коде инстанса нет клиент-специфики — конфиг только settings/env (принцип 6 CLAUDE.md).

**Фан-аут миграций на флот (CI, эскиз):** `fleet.json` — реестр инстансов `[{slug, supabase_ref, db_url_secret, vercel_project}]`. CI-джоб на merge в `main`: цикл по fleet.json → `supabase migration up` на каждый инстанс → отчёт «инстанс × версия миграций»; упавший инстанс не блокирует остальные, но алертит (§6). Ручной прогон на инстанс клиента запрещён так же, как в prod.

До второго клиента флот = dev + prod инстанса клиента №1 (D-19), fleet.json содержит один prod.

## 6. Наблюдаемость

- **Sentry:** `@sentry/nextjs` (клиент + route handlers) + перехват ошибок в Edge Functions (`Sentry.captureException` через DSN). Окружения `dev`/`production`/`client-<slug>`. Соло-разработчик без алертов узнаёт о падении пушей от директора — недопустимо.
- **Алерты (минимум):** рост `status='failed'` в `notification_deliveries` (порог: >5 за 15 мин); `status like 'error:%'` в `ai_logs` (порог: >3 подряд или >10% за час); любой необработанный exception в prod — сразу. Канал — Telegram/почта разработчика. Еженедельный `push_health`-отчёт (pg_cron) — «у кого канал мёртв».
- **Vercel Analytics** включён на production — Web Vitals с реальных бюджетных Android важнее лабораторных замеров.
- Дашборд-минимум (SQL по ai_logs): p50/p90 «голос → карточка» (метрика D-43), доля правок (стоп-сигнал D-35), стоимость токенов за день.

## 7. Бэкапы и восстановление

- **prod:** Supabase Pro — ежедневные автодампы + включить **PITR** (retention ≥ 7 дней). dev — без гарантий, всё восстановимо из миграций+seed.
- **Storage** в автодампы БД не входит: аудио/фото — отдельная периодическая выгрузка (скрипт по бакетам) либо осознанно принятый риск, зафиксированный здесь. Retention аудио — **12 месяцев** (D-18): pg_cron `audio_retention` чистит `voice` и обнуляет `audio_path`; транскрипты — вечно.
- **Проверка восстановления — раз в месяц, по календарю:** восстановить прод-дамп в пустой временный проект → прогнать смоук §3.10 логином + 2–3 запроса (баланс очков = SUM, лента задач) → удалить проект → отметить дату и результат. Бэкап, который ни разу не восстанавливали, бэкапом не считается.
- При флоте (V-02): бэкап-политика — часть провижининга (§5, чек-лист); ежемесячная проверка — ротацией по одному инстансу из флота.
