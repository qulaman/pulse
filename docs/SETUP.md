# SETUP.md — среды, секреты, bootstrap, провижининг клиента

Что это: инфраструктура продукта Pulse как она есть — среды, секреты, развёртывание и заведение клиента в общей базе (D-134); для того, кто разворачивает и сопровождает продукт. Арбитр — `DECISIONS.md` (D-19 среды, D-134 одна база на всех клиентов, разделы G/H); при расхождении DECISIONS.md > этот файл. Схема БД — `docs/DATABASE.md`; API и тик — `docs/BACKEND.md`. Документ описывает построенное; идеи непостроенного — `IDEAS.md`, смена способа — решением в `DECISIONS.md`.

## 1. Среды (D-19)

Все клиенты живут в одной базе и одном деплое (D-134): новый клиент — компания с людьми в общей базе, §5; отдельный инстанс (свой Supabase-проект и деплой) — опция поставки. Сейчас среда одна — dev: прод-проекта Supabase и CI нет (`.github/` нет), вопрос открыт в D-19.

| Среда | Supabase | Регион | Тариф | Vercel |
|---|---|---|---|---|
| **dev** | `pulse-dev` | Франкфурт (`eu-central-1`) | Free | проект `pulse`: Production и все preview-деплои (ветки/PR) |

Общая база — Франкфурт (закон РК о ПД, H.13: пилот = Франкфурт + письменные согласия); клиенту, которому нужна база в своей юрисдикции, — отдельный инстанс в его регионе (D-134 п. 2). Один Vercel-проект `pulse` (Hobby, домен `pulse-blond-one.vercel.app`): и Production, и Preview смотрят в dev-Supabase (WORKLOG 2026-09-25).

**Правило миграций (нарушение = инцидент):**

1. Пишем миграцию локально в `/supabase/migrations` (`YYYYMMDDHHMMSS_описание.sql`, одна миграция = одна фича, старые не правятся).
2. Прогоняем в dev: `pnpm db:push` (`supabase db push` в слинкованный dev-проект).
3. **`supabase db push` в прод запрещён.** Ручной прогон миграций в прод с ноутбука запрещён.

## 2. Env-переменные

`.env.example` в корне репозитория **обязателен**: все имена переменных с комментариями, без значений. Новая переменная без строки в `.env.example` не проходит ревью. Проверка схемы env — `lib/env.schema.ts`.

| Переменная | Где живёт | Значение на dev | Примечание |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel, `.env.local` | URL pulse-dev | публичная |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | там же | anon dev | публичная |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel server-only, `.env.local` | dev key | **только сервер, никогда в клиент/NEXT_PUBLIC** |
| `SUPABASE_ACCESS_TOKEN` | только `.env.local` | свой | personal access token Supabase CLI (или `supabase login`); в Vercel не нужен |
| `SUPABASE_DB_PASSWORD` | только `.env.local` | пароль dev-БД | для `db push` / `db reset --linked` слинкованного dev-проекта; в Vercel не нужен |
| `OPENAI_API_KEY` | Vercel server-only | ключ | STT (`gpt-4o-transcribe`, D-39) |
| `ANTHROPIC_API_KEY` | Vercel server-only | ключ | парсер, `claude-haiku-4-5` и эскалация |
| `STT_PROVIDER` | Vercel | `openai` | по D-48 — дефолт инстанса под `company.settings.stt`; фактически `/api/voice/transcribe` берёт провайдера только из `settings.stt` (zod-дефолт `openai`), env читает `transcribe()` без настроек (вопрос — WORKLOG 2026-09-23, 018f) |
| `STT_FALLBACK_PROVIDER` | Vercel | пусто | запасной STT-провайдер; так же, как `STT_PROVIDER`, — под `settings.stt.fallback` |
| `DEEPGRAM_API_KEY` | Vercel server-only | по желанию | STT-провайдер `deepgram` (`nova-3`) |
| `ELEVENLABS_API_KEY` | Vercel server-only | по желанию | STT-провайдер `elevenlabs` (`scribe_v2`), роль — fallback (D-53) |
| `DEEPSEEK_API_KEY` | Vercel server-only | по желанию | экспериментальный парсер `deepseek-*` для «Лаб» (D-63) |
| `PARSER_MODEL` | Vercel | пусто | модель парсера; в приложении её задаёт `settings.parser.model` (дефолт `claude-haiku-4-5`), env читает `pnpm eval:parser` |
| `PARSER_ESCALATION_MODEL` | Vercel | пусто | модель эскалации; в приложении — `settings.parser.escalation_model` (дефолт `claude-sonnet-5`), env читает `pnpm eval:parser` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel | **своя пара среды** | см. предупреждение ниже |
| `VAPID_PRIVATE_KEY` | Vercel server-only | пара среды | |
| `VAPID_SUBJECT` | Vercel | `mailto:...` | контактный email |
| `LOGIN_CODE_SECRET` | Vercel server-only, `.env.local` | необязателен | ключ HMAC кодов входа и адресов в `login_attempts` (D-135); без него — производный от `SUPABASE_SERVICE_ROLE_KEY`. Смена ключа гасит только живые коды (15 минут) |
| `CRON_SECRET` | Vercel server-only, `.env.local` | свой | секрет тика: `/api/push/sweep` сверяет `Authorization: Bearer <CRON_SECRET>`, без него — 401 (§3, шаг 7) |
| `DEMO_RESET_ENABLED` | Vercel server-only, `.env.local` | `1` | замок кнопки «Обнулить демо-базу» (`POST /api/admin/reset-demo`, стирает активность компании, людей и настройки оставляет); без него роут отвечает 403; **на проде не задавать** — в общем деплое включился бы всем компаниям; переезд в признак демо-компании — D-134 п. 6 |
| `NEXT_PUBLIC_DEMO_MODE` | Vercel, `.env.local` | `1` | показывает раздел «Демо» в Настройках; решает всё равно серверный замок; **на проде не задавать** (D-134 п. 6) |
| `QUERY_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `INTERNAL_FN_SECRET`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | — | — | объявлены в `.env.example` и `lib/env.schema.ts` (необязательные), код их не использует: ассистента вопросов к данным, Telegram, Edge Functions и Sentry нет |

**⚠️ VAPID: своя пара на каждую среду, смена ключей убивает подписки.** Push-подписка браузера криптографически привязана к публичному VAPID-ключу. Замена пары = **все** существующие подписки людей мертвы, пока человек не откроет приложение: оно сверяет ключ подписки (если браузер его сообщает) и подписывается заново само (D-125, BACKEND.md §4 «Гигиена канала»), до этого пуши не доходят. Поэтому: (а) разные среды и инстансы никогда не делят пару; (б) пара, на которую подписаны люди, ротируется только при компрометации, с осознанным планом переподписки.

## 3. Bootstrap с нуля (пошагово)

Предусловия: Node 20+, pnpm, Supabase CLI, аккаунты Supabase/Vercel/OpenAI/Anthropic.

1. **Репозиторий:** `git clone` → `pnpm install`. Скопировать `.env.example` → `.env.local`, заполнять по ходу шагов.
2. **Supabase-проект:** создать `pulse-dev` (Free) в регионе Франкфурт, ключ подписи JWT — асимметричный (Authentication → JWT Keys, ECC): `getClaims` проверяет сессию на сервере без похода в Auth; с прежним симметричным секретом вход работает, но каждый рендер спрашивает Auth (D-126, `lib/auth.ts`). `supabase login` → `supabase link --project-ref <dev-ref>` (локальная работа всегда слинкована на dev).
3. **Миграции:** `pnpm db:push` в dev. Проверить: таблицы, RLS включён на каждой. pg_cron-джобов нет — единственный планировщик — Vercel cron (шаг 7).
4. **Демо-состояние:** `pnpm db:clean` — стирает задачи/сообщения/очки/логи/черновики и smoke-логины dev-проекта, людей и настройки оставляет (для показа); `pnpm db:reset` возвращает полный seed для pgTAP. **Seed:** прогнать `supabase/seed.sql` в dev (демо-компания, «два Ерлана», задачи во всех статусах — контракт сида в DATABASE.md). **В prod seed не катится никогда** — прод наполняется анкетой клиента (§5).
5. **VAPID:** `npx web-push generate-vapid-keys` — своя пара на каждую среду (§2). Разложить по env Vercel.
6. **Vercel:** `vercel link` → env-переменные из таблицы §2 (сейчас и Preview, и Production получают dev-значения) → `git push` ветки = preview-деплой, push в `main` = production-деплой `pulse-blond-one.vercel.app`; оба на dev-Supabase. Регион функций = регион базы (`vercel.json` → `regions`, сейчас `fra1`): иначе каждый запрос к базе идёт через океан (D-126).
7. **Тик:** `vercel.json` объявляет один cron — `/api/push/sweep`, сейчас `0 3 * * *` — раз в сутки, 08:00 Asia/Aqtobe: проект `pulse` в Vercel на Hobby (WORKLOG 2026-09-25), cron раз в минуту (`* * * * *`) — тариф Pro; минутный тик — открытый вопрос В-8 (D-125). Тот же тик выпускает отложенные задачи (`publish_due_scheduled`), гонит напоминания, эскалацию заявок и сигналы директора (D-114) — полный порядок шагов в BACKEND.md §10. Задать `CRON_SECRET` в env Vercel — роут сверяет `Authorization: Bearer <CRON_SECRET>`. Роут принимает и `GET` (так зовёт cron Vercel), и `POST`. Локально cron нет: рядом с `pnpm dev` запускать `pnpm dev:tick`. **Порядок выкатки D-114: миграции — до кода**: воркер без `claim_deliveries` не отправит ни одного пуша.
8. **Telegram-боты, вебхук, Edge Functions** — не построено (D-21, G.20c): `supabase/functions` нет.
9. **Смоук-чек-лист после первого деплоя** (на реальном телефоне, не эмуляторе):
    - [ ] логин сид-пользователем (director), Пульс открывается;
    - [ ] подписка на push + тестовый push доходит (телефон заблокирован);
    - [ ] голосовое → транскрипт → карточки подтверждения на доске Пульса → задача у сотрудника.

## 4. Секреты: правила

- Секреты живут **только** в env (Vercel env, `.env.local`). В коде, коммитах, логах, `ai_logs`, клиентском бандле — никогда. `NEXT_PUBLIC_*` — только заведомо публичное (URL, anon key, VAPID public).
- `SUPABASE_SERVICE_ROLE_KEY` — только серверный код (route handlers и скрипты `scripts/*`). Импорт серверного supabase-клиента из клиентского кода — ошибка сборки (обёртка с `server-only`).
- **Ротация:** AI-ключи — по календарю раз в квартал и при любом подозрении; VAPID — только при компрометации (см. §2).
- **При утечке:** (1) немедленно отозвать/перевыпустить ключ у провайдера (Supabase: rotate service role; OpenAI/Anthropic: revoke); (2) обновить env во всех средах, редеплой; (3) если ключ был в git — вычистить историю (BFG) и считать утёкшим навсегда; (4) проверить логи провайдера на чужое использование; (5) записать инцидент (что, когда, чем закрыт) в `DECISIONS.md` или журнал инцидентов.

## 5. Новый клиент (D-134)

Клиент — компания с людьми в общей базе, а не новый проект. Только для опции отдельного инстанса (D-134 п. 2) его проекты Supabase и Vercel заводятся вручную (регион базы — юрисдикция клиента, регион функций Vercel — тот же, §3 шаг 6). Компанию заводит скрипт:

```
pnpm seed:client <анкета.json> [--dry-run] [--undo]      # scripts/seed-client.ts, образец — scripts/client.example.json
  анкета: { slug, company_name, settings{...}, director{...}, tv{...}, employees[] }  // settings → company.settings
  цель — проект из .env.local; --dry-run показывает план, --undo откатывает ровно анкету; идемпотентен;
  алиасы подсказываются по D-54; пароли без значения в анкете генерируются и печатаются один раз;
  insert company (settings из анкеты), профили из employees[], служебный tv-пользователь; демо-данные НЕ сеются
```

Скрипт ещё живёт по V-02: при другой компании в базе отказывается без `SEED_CLIENT_ALLOW_MULTI=1` и находит компанию по имени, а не по `slug` — правка в наряде D-134 п. 6. Реестра клиентов и миграций на отдельные инстансы нет; идея — IDEAS.md (И-78).

**Чек-лист приёмки клиента** (перед передачей, см. также TESTING.md §7):
- [ ] миграции: версия схемы = HEAD `main`;
- [ ] RLS-тесты (pgTAP) зелёные, включая «компания A не видит компанию B»; у отдельного инстанса — прогнаны на нём самом;
- [ ] смоук §3 (шаг 9) пройден на устройстве под директором нового клиента;
- [ ] company.settings соответствует анкете (тихие часы, правила очков, rating_mode);
- [ ] в коде нет клиент-специфики — конфиг только `company.settings` (принцип 6 CLAUDE.md).

## 6. Наблюдаемость

- Ошибки роутов — `console.error` в логи Vercel, без тела запроса и ключей (BACKEND.md §12).
- Стоимость каждого разбора и STT — страница `/lab` (D-63); правки директора в разборах (D-35) — `pnpm eval:harvest` собирает подтверждённые разборы в черновики фикстур.
- «У кого канал мёртв» — всегда на экране «Сотрудники» (RPC `push_health()`), директору — пуш «Уведомления не доходят» раз в неделю на человека (`team_channel_alerts_due`, D-114).
- Sentry, алерты, Vercel Analytics / Web Vitals и дашборд латентности не построены; идея — IDEAS.md (И-85).

## 7. Бэкапы и восстановление

- Среда одна — dev, без гарантий: всё восстановимо из миграций + seed.
- Storage (аудио, фото) в дампы БД не входит; аудио копится бессрочно, транскрипты хранятся вечно (D-18 ◐, D-66 п.6).
- Бэкапов прода, PITR, выгрузки Storage, срока хранения аудио и проверки восстановления нет; идеи — IDEAS.md (И-80; прод и бэкапы — указатель D-19).
