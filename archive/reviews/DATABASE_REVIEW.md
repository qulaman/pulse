# Ревью: Senior DBA / Postgres — WAG Pulse

## Вердикт

Готовность области «БД/Supabase» к агентной разработке — **4/10**. DATABASE.md — это эскиз таблиц, а не контракт: агент, который начнёт писать миграции по нему, упрётся в невозможные конструкции (REFRESH CONCURRENTLY из триггера, «view с параметром»), в классическую бесконечную рекурсию RLS на profiles и в отсутствие целых сущностей, на которые опираются фичи CONCEPT (ai_logs, доставка push, streak/отсутствия, idempotency-ключи). RLS описана принципами, а не политиками — при этом минимум три заявленных принципа противоречат друг другу или самой модели данных (рейтинг vs «свои читает каждый», manager-поддерево, MV без RLS для anon-ТВ). Паттерн заморозки очков доверен «выбери сам» — это ровно то место, где два агента в двух сессиях выберут разное. До старта недели 1 нужен один плотный проход по схеме: список ниже закрывается за 1–2 дня.

---

## Критические проблемы

### 1. `REFRESH MATERIALIZED VIEW CONCURRENTLY` невозможен из триггерной функции

**Где:** DATABASE.md, раздел «Представления и агрегаты»: «Refresh: pg_cron каждые 5 минут + `refresh ... concurrently` по триггерной функции на критичных событиях».

**Последствие:** `REFRESH ... CONCURRENTLY` нельзя выполнять внутри транзакции (Postgres кидает `ERROR: REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run inside a transaction block`), а триггер всегда исполняется внутри транзакции. Агент либо получит ошибку в рантайме, либо «починит» её убрав CONCURRENTLY — и тогда каждый `pending_review` будет брать ACCESS EXCLUSIVE lock на MV и блокировать чтение Пульса.

**Решение:** триггер не рефрешит, а сигналит: `pg_net`-вызов Edge Function `refresh-pulse` (или `pg_notify` + внешний воркер), которая делает `REFRESH CONCURRENTLY` вне транзакции, под advisory-lock (`pg_try_advisory_lock`) — чтобы два одновременных рефреша (cron + событие) не падали с «could not lock materialized view». Дополнительно: CONCURRENTLY требует **unique-индекса на MV** — зафиксировать в доке `unique index on mv_pulse_summary(company_id)` (или `(company_id, user_id)` если строки по сотрудникам), иначе первый же CONCURRENTLY упадёт. И помнить: первый refresh после создания `WITH NO DATA` обязан быть без CONCURRENTLY.

### 2. RLS на profiles с фильтром по company_id = бесконечная рекурсия (42P17)

**Где:** DATABASE.md, RLS: «profiles: читают все внутри company_id». Аналогично все политики «внутри company_id» неявно требуют узнать company_id текущего пользователя — из profiles.

**Последствие:** наивная политика `using (company_id = (select company_id from profiles where id = auth.uid()))` на самой таблице profiles даёт `infinite recursion detected in policy for relation "profiles"` — самая частая ошибка агентов на Supabase. На остальных таблицах — не рекурсия, но подзапрос к profiles в каждой политике на каждую строку.

**Решение (зафиксировать в доке как обязательный паттерн):**
```sql
create function auth_company_id() returns uuid
language sql stable security definer set search_path = public
as $$ select company_id from profiles where id = auth.uid() $$;

create function auth_role() returns text ... -- аналогично
```
и все политики писать через `auth_company_id()` / `auth_role()`. Альтернатива (лучше по производительности): Custom Access Token Hook в Supabase Auth, кладущий `company_id` и `role` в JWT-клеймы, и читать `(auth.jwt()->>'company_id')::uuid`. Выбрать один способ и записать — иначе каждый агент изобретёт свой.

### 3. «Manager видит только своё поддерево manager_id» — рекурсивное дерево в RLS

**Где:** DATABASE.md, RLS: «manager — только своё поддерево manager_id»; CONCEPT §2: manager «создаёт подзадачи своей группе».

**Последствие:** поддерево произвольной глубины = recursive CTE, исполняемый в политике **на каждую строку каждого запроса** к tasks/task_messages. Это и медленно, и почти гарантированно будет написано агентом с рекурсией через profiles → снова проблема №2.

**Решение:** для компании в 45 человек зафиксировать **глубину 1**: менеджер видит задачи, где `assignee_id` — его прямой подчинённый:
```sql
create function subordinates(mgr uuid) returns setof uuid
language sql stable security definer
as $$ select id from profiles where manager_id = mgr $$;
-- в политике: assignee_id in (select subordinates(auth.uid()))
```
Если когда-нибудь понадобится реальное дерево — материализованная closure-таблица `org_edges(ancestor_id, descendant_id)`, обновляемая триггером на profiles.manager_id, и политика по ней. Записать выбор «глубина 1 в v1» явно — CONCEPT это и подразумевает («своей группе»).

### 4. Double-spend в магазине: SUM-баланс не защищён блокировкой stock

**Где:** BACKEND.md §4: «проверка баланса (SUM ≥ price) и stock > 0 в одной SQL-транзакции… (select ... for update на stock)»; DATABASE.md point_transactions.

**Последствие:** `FOR UPDATE` на строке shop_items сериализует конкурентов **по товару**, но не по пользователю. Два заказа одного пользователя на *разные* товары в READ COMMITTED оба прочитают SUM до чужого insert'а → баланс уходит в минус. Инвариант «Баланс = SUM ≥ 0» нигде не защищён на уровне БД.

**Решение:** заказ оформлять функцией `create_order(item_id)` (security definer, вызов из API), внутри:
```sql
perform pg_advisory_xact_lock(hashtext('points:' || auth.uid()::text));
-- затем SUM, проверка, insert order + transaction, update stock
```
Advisory-lock по user_id сериализует все списания одного пользователя; `FOR UPDATE` на stock оставить для товара. Плюс страховочный constraint-триггер на point_transactions: после insert отрицательной суммы проверять `SUM >= 0` для (company_id, user_id) — дёшево при 45 людях, ловит любые будущие пути списания.

### 5. Паттерн заморозки не выбран — выбираю: **hold-final**

**Где:** DATABASE.md point_transactions: «выдача → hold остаётся финальным (или пара release+final — выбери один паттерн и зафиксируй)». «Выбери сам» в контракте для агентов недопустимо — две сессии выберут разное.

**Решение — фиксирую hold-final:**
- заказ → `shop_hold` (−price) — баланс сразу уменьшен;
- отмена (`cancelled`) → компенсация `shop_release` (+price) со ссылкой `order_id`;
- выдача (`delivered`) → **никаких новых транзакций**, hold и есть финальное списание; факт финализации — `orders.status='delivered'` + `delivered_at`.

Обоснование: (а) баланс корректен в каждый момент без промежуточных состояний; (б) release+final создаёт пару +price/−price, между которыми (при любом баге атомарности) баланс временно возвращается — окно для гонки; (в) меньше строк-шума в истории начислений, которую сотрудник видит в профиле. «Заморожено» как отдельная цифра в UI = сумма hold'ов по заказам в статусах `pending|approved` (view `v_user_holds`). Следствие: значение enum `shop_final` **удалить из схемы** (или не создавать) — мёртвое значение в enum провоцирует агента его использовать. Инвариант зафиксировать: на один order — максимум один `shop_hold` и максимум один `shop_release` (partial unique index по `(order_id, source)`).

### 6. Идемпотентность авто-очков: `unique (task_id, rule_code)` — а колонки rule_code нет

**Где:** BACKEND.md §3: «Идемпотентно: unique-ключ (task_id, rule_code)» vs DATABASE.md point_transactions — колонки `rule_code` в схеме нет. DATABASE.md pg_cron §6 требует «идемпотентно (проверять, что транзакция за эту просрочку ещё не создана)» — проверять нечем, `reason text` для этого непригоден.

**Последствие:** cron просрочек раз в 15 минут будет штрафовать одну задачу многократно, либо агент изобретёт проверку по `reason LIKE`.

**Решение:** добавить в point_transactions `rule_code text null` и `create unique index on point_transactions(task_id, rule_code) where source = 'auto_rule'`; insert'ы авто-правил — `on conflict do nothing`. Коды правил перечислить: `on_time`, `early`, `overdue_penalty`, `fast_accept`, `reaction_fire`.

### 7. ai_logs — ключевая таблица упомянута трижды, но не спроектирована

**Где:** BACKEND.md §1 («Поле source писать в ai_logs»), §7 («логировать… в таблицу ai_logs»); CONCEPT §8 («мониторить долю правок в ai_logs»); PLAN недели 3 и 5 («ai_logs с первого дня», «ежедневно читать ai_logs»). В DATABASE.md таблицы **нет вообще**.

**Последствие:** на этой таблице стоит главная продуктовая метрика (доля правок на подтверждении, гейт «директор правит руками → бросит»). Агент недели 3 придумает схему сам, и «доля правок» окажется невычислимой.

**Решение — добавить в DATABASE.md:**
```
ai_logs: id, company_id, user_id, kind enum('stt','parse','query'),
source enum('voice','typed','shared') null, model text, latency_ms int,
ok bool, error text null, transcript text null, raw_response jsonb null,
parsed_entities jsonb null, confirmed_entities jsonb null,  -- diff = «правки»
client_request_id uuid null, created_at
```
RLS: читает director своей компании; insert — только service role. `confirmed_entities` пишется из /api/voice/confirm тем же `client_request_id` — тогда «доля правок» = сравнение двух jsonb.

### 8. ТВ на anon-роли: RLS не работает на materialized views, anon-ключ публичен

**Где:** DATABASE.md RLS: «ТВ-режим работает через отдельный ограниченный token/anon-роль с доступом только к событийным view». FRONTEND.md /tv: Realtime-подписка, гостевой режим.

**Последствие:** (а) MV и обычные view **не наследуют RLS базовых таблиц** (view исполняется с правами владельца, если не `security_invoker`); дать anon `select` на view/MV = отдать данные всем, у кого есть публичный anon-ключ проекта, т.е. любому, кто открыл сайт и посмотрел JS. (б) Realtime Postgres Changes на view не работает — только на таблицы. ТВ, «подписанный anon'ом на события», либо не заработает, либо станет дырой.

**Решение (конкретная схема):**
1. Завести таблицу `tv_events (id, company_id, kind, payload jsonb, payload_guest jsonb, created_at)`, наполняемую триггерами на task_messages/point_transactions/orders — payload уже денормализован и **заранее замаскирован** для guest-режима (имя+инициал, без цифр).
2. ТВ-устройство логинится как обычный auth-пользователь с ролью `tv` (создаётся директором, «устройство» в profiles), сессия долгоживущая. RLS на tv_events: `role in ('tv', ...) and company_id = auth_company_id()`. Никакого anon.
3. Realtime — Postgres Changes на tv_events (RLS применяется) либо broadcast из тех же триггеров через `realtime.send()`.
4. Агрегаты (вердикт, 3 числа) ТВ берёт не из mv_pulse_summary напрямую, а из функции `tv_summary()` security definer, отдающей только разрешённые поля.

Это заодно решает проблему «RLS на mv_pulse_summary»: MV вообще не гранится клиентским ролям, доступ — только через security-definer-функции/`security_invoker` view-обёртку с фильтром company_id.

### 9. Рейтинг и публичные события мерча несовместимы с политикой «point_transactions: свои читает каждый»

**Где:** DATABASE.md RLS: «point_transactions: свои читает каждый» vs CONCEPT §3.1: вкладка «Рейтинг: топ сотрудников», «🎁 Ерлан обменял 200 очков на худи» в общем Эфире; §5: доска почёта.

**Последствие:** клиентский запрос рейтинга под RLS вернёт одну строку — себя. Агент либо «откроет» point_transactions всей компании (сломав настройку top5/full и приватность штрафов), либо рейтинг не соберётся.

**Решение:** сырые транзакции оставить «свои + director». Рейтинг отдавать **только** через `fn_rating(period)` security definer, которая читает company.settings и сама решает: вернуть весь список или топ-5 (+ строку самого запрашивающего). События мерча в Эфир — через `tv_events`/announcements-подобную публичную таблицу событий, а не чтением чужих транзакций.

### 10. Отложенная отправка требует статуса, которого нет в enum

**Где:** DATABASE.md pg_cron §3: «publish tasks where scheduled_send_at <= now() and **status is null/draft**» vs enum статусов `sent|accepted|in_progress|pending_review|done|rework|declined` (status наверняка not null) и CLAUDE.md: «Статусы задач (enum, не расширять без причины)».

**Последствие:** агент недели, где делается отложенная отправка, встанет: draft'а нет, null запрещён паттерном, расширять enum запрещено CLAUDE.md.

**Решение:** это и есть «причина» из CLAUDE.md — добавить значение `scheduled` в enum (это pre-flow-состояние, не трогающее машину сотрудника: `scheduled → sent`). Все выборки лент/пушей/Пульса обязаны фильтровать `status <> 'scheduled'` — записать это правило явно. Альтернатива без расширения enum (хуже, но допустима): отложенные держать в отдельной таблице `outbox_tasks` и материализовать в tasks в момент отправки — тогда RLS «сотрудник не видит будущую задачу» соблюдается автоматически. Выбрать первый вариант и поправить текст cron-джоба.

---

## Дыры проектирования (агент будет гадать)

1. **Где хранится факт доставки push / «Марат не получил»?** (CONCEPT §8: «индикатор недоставки у директора»; PLAN неделя 2). Ни таблицы, ни полей. → Добавить `notification_log (id, company_id, user_id, task_id null, channel enum('push','telegram'), status enum('sent','failed','delivered'), error, created_at)`; индикатор директора = нет ни одной успешной записи по task_id. Заодно метрика недели 9 «push-доставляемость по устройствам» станет считаемой.

2. **Streak и заморозка на отпуск/больничный** (CONCEPT §5, §8: «отпуск замораживает streak»; FRONTEND: профиль со streak). Нет ни streak-состояния, ни таблицы отсутствий. Считать streak на лету из transactions с учётом отпусков — нереалистично для агента. → Таблица `absences (id, company_id, user_id, kind enum('vacation','sick','other'), starts_on date, ends_on date)` (вводит director) + поля `profiles.streak_count int default 0, streak_updated_at` , пересчитываемые триггером/кроном при закрытии задач с пропуском дней, попадающих в absences. Absences также нужна блоку «Люди» (серый ≠ «свободен», если человек в отпуске).

3. **`v_rating_period(period)` — «view с параметром» в Postgres не существует.** (DATABASE.md, «Представления»). → Явно записать: SQL-функция `fn_rating(p_from timestamptz, p_to timestamptz) returns table(user_id, points, rank, delta_vs_prev)` security definer (см. крит. №9); «динамика к прошлому периоду» — второй SUM по сдвинутому окну внутри той же функции.

4. **Куда пишется client_request_id (идемпотентность /api/voice/confirm)?** (BACKEND §1). Ни колонки, ни таблицы. → `client_request_id uuid` в ai_logs (см. №7) + unique-индекс, а вставки confirm делать одной функцией `confirm_entities(payload jsonb, client_request_id uuid)` с `insert ... on conflict` по журналу запросов `ingest_requests(client_request_id pk, created_at)`.

5. **Тип 'reaction_ref' в task_messages не определён** (DATABASE.md task_messages): реакции живут в отдельной таблице reactions — зачем тип сообщения? Агент будет гадать, дублировать ли реакцию сообщением. → Убрать из enum, либо определить: системная строка-событие для ленты/ТВ, создаётся триггером на reactions, meta={emoji, message_id}. Рекомендую второе (лента и ТВ читают только task_messages — тогда реакции в них видны).

6. **Кнопка «Уточнить» и стопка «Вопросы» на Пульсе** (CONCEPT §3.3): как отличить вопрос сотрудника от обычного текста и понять, что он отвечен? → В enum type добавить `question`; «отвечен» = существует более поздний message директора в той же задаче, либо `meta.answered_at`, проставляемый при ответе. Зафиксировать выбор (рекомендую meta.answered_at — дёшево для счётчика стопки).

7. **Тихий режим и прочие пользовательские настройки** (FRONTEND, «Тихий режим»; настройка эффектов game feel): полей нет. → `profiles.settings jsonb default '{}'` (quiet_mode, effects_enabled, push_prefs). Тривиально, но без записи в доке агент положит это в localStorage и потеряет при переустановке PWA.

8. **orders не фиксирует цену на момент заказа** (DATABASE.md orders): цена товара редактируема в админке (CONCEPT §8 «цены редактируемые»), после изменения price hold и «возврат при отмене» разъедутся с shop_items.price. → `orders.price int not null` (снапшот), release всегда компенсирует ровно сумму hold'а по order_id, не текущую цену.

9. **Storage-политики «зеркалят RLS задач» — как именно?** (DATABASE.md, Storage). storage.objects не заджойнишь с tasks без конвенции пути. → Зафиксировать конвенцию: `bucket/{company_id}/{owner_user_id}/{uuid}.ext`; политики — по сегментам пути (`storage.foldername(name)`); всё чтение чужих файлов (директор слушает аудио сотрудника, ТВ показывает фото) — только через signed URLs, генерируемые сервером после проверки прав. Бакеты private все четыре.

10. **Что значит «пометка просрочек»** (DATABASE.md pg_cron §6): отдельного поля/статуса нет, а статусы расширять нельзя. → Не хранить флаг: просрочка — вычислимое свойство (`deadline < now() and status not in ('done','declined')`), partial-индекс `(company_id, deadline) where status in ('sent','accepted','in_progress','rework')`; cron создаёт только system-message + штраф (идемпотентно по крит. №6). Записать, чтобы агент не добавил колонку `is_overdue`.

---

## Противоречия между документами

1. **DATABASE.md pg_cron §3** «status is null/draft» ⟷ **CLAUDE.md** «Статусы задач (enum, не расширять)» + сам enum в DATABASE.md без draft. (Крит. №10.)
2. **BACKEND.md §3** «unique-ключ (task_id, rule_code)» ⟷ **DATABASE.md point_transactions** — колонки rule_code нет. (Крит. №6.)
3. **DATABASE.md RLS** «point_transactions: свои читает каждый» ⟷ **CONCEPT §3.1/§5** публичный рейтинг, доска почёта, «Ерлан обменял 200 очков» в общем Эфире. (Крит. №9.)
4. **DATABASE.md** «refresh ... concurrently по триггерной функции» ⟷ ограничение Postgres: CONCURRENTLY невозможен в транзакции триггера. (Крит. №1.)
5. **DATABASE.md, Общие правила** «Везде company_id not null» ⟷ **DATABASE.md push_subscriptions** — company_id отсутствует. Мелочь, но это нарушение собственного инварианта в собственном доке; добавить company_id (при мультитенантности один email мог бы жить в двух компаниях — подписка должна знать, чьи пуши слать).
6. **DATABASE.md point_transactions** содержит source `shop_final` ⟷ там же предложен вариант «hold остаётся финальным», при котором shop_final никогда не используется. После фиксации hold-final (крит. №5) — убрать значение.
7. **CONCEPT §3.5** «Гостевой режим: без фамилий и цифр» ⟷ **DATABASE.md** гостевой режим упомянут как «view без фамилий», но при Realtime-архитектуре ТВ (события из таблиц) view не участвует в подписке — маскирование обязано происходить при записи payload_guest (см. крит. №8), иначе фамилии уедут в сокет.

---

## Улучшения (не блокируют)

- **[high] Индексы, отсутствующие в доке:** `task_messages (task_id, created_at)` — основной запрос ленты; `task_messages (company_id, created_at desc)` — живая лента Пульса/ТВ; `point_transactions (company_id, user_id, created_at)` — SUM-баланс и история; `orders (company_id, status)` — стопка «Заявки магазина»; `recurrence_rules (next_run_at) where is_active` — cron-скан; `reminders (remind_at) where not sent`; `profiles (company_id)`, `reactions (message_id)`. Перечислить в DATABASE.md — агент сам их не поставит.
- **[high] Партиционирование task_messages — НЕ нужно, зафиксировать это письменно.** 45 сотрудников × щедрые 300 событий/день ≈ 100–150 тыс. строк/год; btree-индексы покроют это на годы. Партиционирование добавит боли с PK/FK/RLS и Realtime. Вместо него — записать порог пересмотра («вернуться к вопросу после 10 млн строк») и, для SaaS-перспективы, сразу класть company_id первым столбцом составных индексов.
- **[mid] Снапшот-чекпоинты баланса:** SUM по всей истории честен, но через 2–3 года истории и при рейтингах «за всё время» станет дорогим. Заложить таблицу `point_balance_checkpoints (user_id, as_of, balance)` (месячный cron) и функцию баланса = checkpoint + SUM(после as_of). Не делать в MVP, но зарезервировать в доке, чтобы никто не «оптимизировал» кэш-полем в profiles (запрещено CLAUDE.md §4).
- **[mid] pg_cron и таймзона:** «18:00 Asia/Aqtobe» — pg_cron в Supabase живёт в UTC. Записать расписания в UTC явно (18:00 Aqtobe = 13:00 UTC) или задать `cron.timezone`; иначе сводка приедет в 23:00.
- **[mid] Constraint'ы, которых нет в доке:** `check (amount <> 0)` на point_transactions; `check (stock >= 0)` на shop_items; `check (price > 0)`; `reason not null` уже есть — добавить `check (length(trim(reason)) > 0)`; FK `orders.item_id` с `on delete restrict` (товар с заказами не удалять, а `is_active=false`).
- **[mid] profiles.is_active bool:** оффбординг в бэклоге (CONCEPT §8), но без флага активности агент недели 1 напишет матчер имён и рассылку по всем profiles навсегда. Поле стоит одну строку сейчас и недели рефакторинга потом.
- **[low] updated_at + триггер moddatetime** на tasks/orders/shop_items — Пульсу и ТВ нужно «когда последний раз менялось».
- **[low] `announcements` не имеет company_id-индекса и признака закрепления** («утренние объявления» будут листаться) — `(company_id, created_at desc)`.
- **[low] Реакции «золотая обводка» директора vs реакции сотрудников:** reactions не хранит роль — если реакции когда-нибудь дадут сотрудникам, «директорская» подсветка потребует join. Дёшево сейчас: пусть UI решает по author_id, но в доке отметить, что reactions.author_id — любой участник, а очки даёт только директорская (проверка в триггере).

---

## Вопросы владельцу продукта

1. **Публичность очков:** в режиме «full» рейтинг показывает суммы очков всех сотрудников всем — включая тех, у кого штрафы утянули баланс вниз? Или сотрудники видят только позиции, а суммы — только свои? (Определяет RLS и fn_rating; связано с «антирейтинг демотивирует».)
2. **Срок хранения голосовых:** аудио директора и сотрудников — ПД и потенциально коммерческая тайна. Хранить вечно, N месяцев, или до закрытия задачи + N? (Определяет lifecycle-политику Storage и то, будет ли плеер работать в старых задачах.)
3. **Кто вносит отпуска/больничные** (нужны для заморозки streak и цвета «Люди»): директор голосом («Айгуль в отпуске до пятницы») — это новый kind в парсере — или руками в админке? Нужна ли роль HR?
4. **ТВ по умолчанию:** обычный режим (с фамилиями и цифрами очков) или гостевой? В кабинет заходят посторонние — согласие сотрудников на ПД покрывает экран на стене?
5. **Отмена заказа сотрудником:** может ли сотрудник сам отменить pending-заказ (возврат hold), или отмена — только director/shopkeeper? (BACKEND даёт cancel только director/shopkeeper — тогда сотрудник, передумавший через минуту, идёт на поклон к завхозу.)
6. **Очки при увольнении:** сгорают, выплачиваются мерчем, конвертируются? (Влияет на то, можно ли жёстко чистить историю при оффбординге.)

---

## Чего не хватает в доках для агентной разработки

1. **Полный SQL-скелет миграции №1** (или хотя бы канонические сигнатуры `auth_company_id()/auth_role()` и одна эталонная пара политик select/insert) — образец, который агенты копируют, вместо четырёх разных стилей RLS в четырёх сессиях.
2. **seed.sql для dev:** демо-компания, director + manager + 5 employees с реальными алиасами-фикстурами («Ерлан», «Ерлан Б.», «Айгуль»), 10 задач во всех статусах, транзакции очков, 2 товара, 1 заказ в hold. Без сида негативные RLS-тесты и разработка Пульса невозможны; PLAN недели 1 требует «негативный тест», но тестовых данных не описывает.
3. **Спека RLS-тестов:** framework (рекомендую pgTAP в `supabase/tests/`, запускать `supabase test db`) и таблица кейсов: employee не видит чужую task; employee не может insert в point_transactions; manager видит задачу подчинённого, но не соседнего отдела; tv-роль видит tv_events и ничего больше; anon не видит ничего. Сейчас «RLS проверена» из Definition of Done неисполняема — не сказано чем.
4. **Контракт mv_pulse_summary по колонкам:** фронт обещает «Пульс = 1 запрос mv_pulse_summary» (FRONTEND, Производительность) — значит нужен точный список полей (вердикт-цвет, счётчики стопок «Требует вас», 3 числа недели с дельтами, строки по сотрудникам для «Люди»). Без него фронт-агент и БД-агент сойдутся только случайно.
5. **Фикстуры фраз для парсера + матчера имён** (CLAUDE.md требует тесты «фикстуры реальных фраз на русском») — файла фикстур нет; для БД-части нужны фикстуры алиасов с коллизиями (два Ерлана) — на них строится UNIQUE/индексная стратегия aliases.
6. **Каталог событий tv_events/живой ленты:** какие kind существуют (task_sent, task_done, points, merch_delivered, announcement...), какой payload у каждого, какой payload_guest. Это контракт между триггерами БД, Пульсом и ТВ.
7. **Правила нумерации/именования миграций и запрет `db push` в прод** (только `supabase migration up` через CI) — миграционная дисциплина заявлена в CLAUDE.md одной строкой, но без конвенции имён (`YYYYMMDDHHMMSS_описание.sql`) и без правила «одна миграция = одна фича, откат — новой миграцией».
