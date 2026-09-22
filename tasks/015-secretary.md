# tasks/015-secretary.md — Секретарь: заявки директора одним тапом (кофе, чай, врач, «зайди ко мне»)

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай.

> Источник: план владельца (2026-09-22): «кофе/чай/врач/„зайди ко мне“ — не задача: нет приёмки, нет дедлайна, нет очков, живёт пять минут; у директора один тап, у секретаря две кнопки; каталог кнопок в настройках компании; роль `secretary`; приватно, на стену не выносится». Анализ архитектора и решения — D-79. Этот файл — единственный текст наряда.

Наряд состоит из **четырёх фаз = четырёх сессий и веток**: A → B → C → D. Каждая фаза — отдельная запись в WORKLOG и отдельный отчёт; следующую фазу начинать только после приёмки предыдущей. Фазы C и D здесь заданы рамкой; их шаги архитектор допишет после приёмки B.

---

## 0. Решения, на которых стоит наряд (D-79; исполнителю — к сведению, не обсуждать)

1. **Заявка — своя сущность `errands`** со своим коротким автоматом `sent → accepted → done | declined | cancelled`. Не задача: без приёмки директором, без дедлайна, без очков, без /confirm.
2. **Роль `secretary` в enum `user_role`**, а не флаг. Секретарь — обычный сотрудник (задачи, Лента, Эфир, магазин, рейтинг) плюс право читать и вести заявки. Секретарей может быть несколько; заявка уходит всем, забирает первая нажавшая «Принял».
3. **Списки «команды» в SQL и TS больше не перечисляют роли руками**: один SQL-хелпер `team_role(user_role)` и одна TS-константа `TEAM_ROLES`. Следующая роль стоит одну строку.
4. **Каталог кнопок — данные**, `company.settings.secretary.actions` (V-02). В строке заявки — код `kind` и снимок `label`: каталог могут переименовать, история не должна поехать. Отдельного флага `enabled` нет: модуль включён тогда и только тогда, когда в компании есть активный секретарь.
5. **«Зайди ко мне» зовёт секретаря.** Колонки `target_user_id` в v1 нет (G.15): звать произвольного сотрудника — это примитив «личное сообщение» из D-75 §8(а), не заявка.
6. **Отмена — тостом 5 секунд на клиенте, строка в БД появляется по истечении тоста.** Пуш секретарю уходит через `kickDeliveries()` сразу после вставки, поэтому «отменить» после вставки не отменило бы пуш; ветки в `notification_deliveries_deliver_after()` нет. Отмена уже отправленной заявки — переход `cancelled`, без пуша: карточка у секретаря гаснет по Realtime.
7. **Outbox (принцип 8), четыре события:** `errand_sent` каждому активному секретарю; `errand_accepted` / `errand_done` / `errand_declined` автору. Все мимо окна доставки: заявка живёт минуты, «кофе в 21:05» утром не нужен. Эскалация — один повторный `errand_sent` через `escalate_after_min` (дефолт 3) из минутного тика `POST /api/push/sweep`; идемпотентность на `errands.escalated_at`, как `events.reminded_at`. Директору — квитанция «не открывал(а) с 9:14» по `seen_at` строки outbox (D-32), отдельного пуша директору нет.
8. **Приватность:** читают автор, любой `secretary` своей компании, директор; `tv` — никогда; функции стены заявки не читают (D-45). Известное следствие: на стене секретарь выглядит «без дел», пока бегает с заявками — принято.
9. **Тексты нейтральны по роду** (docs/DESIGN.md: без местоимений): «Принято · Айгуль», «Готово · Айгуль», а не «приняла».
10. **Не строим в v1:** очки за заявки; стена/ТВ; Telegram-ярус; заявки от сотрудников; повторяющиеся заявки; фото-подтверждение; вызов произвольного сотрудника.

---

## Контекст (читать только это, общий для всех фаз)

- `CLAUDE.md`: принципы 1, 2, 5, 6, 7, 8; регламент п.4 (миграции), п.6 (время).
- Код, который трогаем (читать по мере шагов, не заранее): `supabase/migrations/20260917200000_notes.sql` (образец таблицы с RLS, уникальным `client_request_id`, публикацией Realtime), `supabase/migrations/20260918150000_calendar_events.sql` (образец RPC перехода `respond_event`, тика `events_due_reminders`, грантов; последняя редакция `tv_summary` — §10), `supabase/migrations/20260910140000_points_and_settings.sql` (последняя редакция `fn_rating`), `supabase/migrations/20260917140000_report_in_transition.sql` (идемпотентность RPC через `ingest_batches` — образец для `transition_errand`), `supabase/migrations/20260910180000_delivery_outbox.sql` (форма строки outbox), `app/api/push/sweep/route.ts`, `lib/admin/reset-demo.ts`, `scripts/db-clean.ts`, `supabase/tests/020_calendar.test.sql` (образец pgTAP), `supabase/seed.sql` (фикстуры).
- Решения: D-32 (семантика «не открывал»), D-38 (окно доставки — заявок не касается), D-45 (стена), D-75 §3–4 (тост «Отменить» у заметок — образец UX), D-79 (этот наряд).
- Факты о среде: dev-проект Supabase `qobsbjugromdwfdodwwa`; `pnpm test:rls` требует Docker Desktop — если Docker нет, pgTAP не запускать, а в WORKLOG написать «pgTAP 021 не выполнялся (нет Docker)» и проверить миграцию скриптом с service role. Рабочая копия одна на все сессии: **`git add` только по путям из скоупа фазы**, никогда `git add -A`; файл, который уже был изменён в `git status` на старте сессии, перед `git add` собирать как base+свои правки (blob-стейдж), чужие незакоммиченные правки в коммит не брать.
- Ветки — от **текущего HEAD** (не от `main`: `main` отстаёт и не содержит кода, на который наряд опирается). Старые миграции не править. Секретов в код не вносить. `db push` — только в dev.

---

## Фаза A — роль, таблица `errands`, RLS, outbox, RPC, эскалация (одна сессия)

### Ветка и скоуп
- Ветка: `feat/015a-secretary-db`.
- Трогать только: `supabase/migrations/20260922120000_secretary_role.sql` (новая), `supabase/migrations/20260922120100_errands.sql` (новая), `supabase/tests/021_errands.test.sql` (новый), `lib/supabase/types.ts` (через `pnpm db:types`), `app/api/push/sweep/route.ts`, `lib/admin/reset-demo.ts`, `scripts/db-clean.ts`.

### Шаги
1. **Миграция `20260922120000_secretary_role.sql`** — ровно одна команда и комментарий-шапка «зачем отдельным файлом»: новое значение enum нельзя использовать в той транзакции, где оно добавлено, а CLI выполняет каждую миграцию в своей транзакции.
   ```sql
   alter type user_role add value if not exists 'secretary';
   ```
2. **Миграция `20260922120100_errands.sql`** (в шапке — по строке на каждый пункт «зачем» из §0):
   1. **Хелпер команды** и перевод существующих списков на него:
      ```sql
      create or replace function team_role(r user_role) returns boolean
      language sql immutable
      as $$ select r in ('employee', 'manager', 'shopkeeper', 'secretary') $$;
      ```
      Затем `create or replace function fn_rating(...)` с телом целиком из `20260910140000_points_and_settings.sql`, где строка `and p.role in ('employee', 'manager', 'shopkeeper')` заменена на `and team_role(p.role)`; и `create or replace function tv_summary(...)` с телом целиком из `20260918150000_calendar_events.sql` §10, где та же строка в карусели `load` заменена на `and team_role(p.role)`. Ничего кроме этих строк в телах не менять.
   2. **Тип и таблица:**
      ```sql
      create type errand_status as enum ('sent', 'accepted', 'done', 'declined', 'cancelled');

      create table errands (
        id                uuid primary key default gen_random_uuid(),
        company_id        uuid not null references companies,
        author_id         uuid not null references profiles,       -- the director who asked
        kind              text not null,                           -- code from company.settings.secretary.actions
        label             text not null,                           -- the button's label at the time of asking
        note              text,                                    -- «без сахара», «в переговорную»
        status            errand_status not null default 'sent',
        claimed_by        uuid references profiles,                -- the secretary who took it
        decline_reason    text,
        audio_path        text,                                    -- voice bucket; never edited (principle 5)
        source_transcript text,
        inbox_item_id     uuid references inbox_items on delete set null,
        client_request_id uuid,
        escalated_at      timestamptz,                             -- the one repeat push went out
        created_at        timestamptz not null default now(),
        accepted_at       timestamptz,
        done_at           timestamptz,
        updated_at        timestamptz not null default now()
      );
      ```
      Триггер `moddatetime(updated_at)` по образцу `notes`. Комментарий к таблице: «director's short requests to the secretary; kind = catalog code, label = its snapshot; never shown on the wall».
   3. **Индексы:** `errands_company_active_idx on errands (company_id, created_at desc) where status in ('sent','accepted')`; `errands_author_idx on errands (author_id, created_at desc)`; уникальный `errands_client_request_idx on errands (client_request_id) where client_request_id is not null`.
   4. **RLS:** `enable row level security`. `errands_select`: `company_id = (select auth_company_id()) and (author_id = (select auth.uid()) or (select auth_role()) in ('director', 'secretary'))`. `errands_insert` (`with check`): `company_id = (select auth_company_id()) and author_id = (select auth.uid()) and (select auth_role()) = 'director'`. Политик `update`/`delete` **нет** — переходы только через RPC.
   5. **Публикация Realtime:** добавить `errands` в `supabase_realtime` тем же идемпотентным блоком, что у `notes`.
   6. **Outbox-триггер `notify_outbox_errand()`** (`after insert or update of status on errands`, `security definer`), по форме `notify_outbox_announcement`; в `meta` каждой строки — `errand_id` (колонка `task_id` у заявок пустая) и `url = '/secretary?e=' || new.id`:
      - `INSERT` со `status = 'sent'` → по строке `errand_sent` каждому `profiles` своей компании с `role = 'secretary' and is_active and id <> new.author_id`; `title` = `new.label`, `body` = `coalesce(new.note, '')`.
      - `UPDATE` в `accepted` → автору `errand_accepted`: `title` = `'Принято · ' || имя`, где имя — `split_part(full_name, ' ', 1)` того, кто в `claimed_by`; `body` = `new.label`.
      - `UPDATE` в `done` → автору `errand_done`: `title` = `'Готово · ' || имя`, `body` = `new.label`.
      - `UPDATE` в `declined` → автору `errand_declined`: `title` = `'Не может · ' || имя` (имя — `claimed_by`, а если пусто — того, кто вызвал RPC: триггер берёт `auth.uid()`), `body` = `new.label || coalesce(' · ' || new.decline_reason, '')`.
      - `UPDATE` в `cancelled` → пуша нет; `delete from notification_deliveries where status = 'queued' and meta->>'errand_id' = new.id::text` — ещё не ушедшие строки не уходят.
      Функцию `notification_deliveries_deliver_after()` **не трогать** (§0 п.6–7).
   7. **RPC `transition_errand(p_id uuid, p_to text, p_reason text default null, client_request_id uuid default null) returns jsonb`**, `security definer`, одна транзакция:
      - идемпотентность как в `transition_task` (`20260917140000_report_in_transition.sql`): при `client_request_id is not null` — `insert into ingest_batches ... on conflict do nothing`, при повторе вернуть сохранённый результат с `duplicate = true`;
      - `p_to not in ('accepted','done','declined','cancelled')` → `raise exception 'bad_status'`;
      - строка `select * ... where id = p_id and company_id = auth_company_id() for update`; нет → `raise exception 'forbidden'`;
      - переходы (`v_role := auth_role()`, `v_user := auth.uid()`):
        - `sent → accepted`: только `v_role = 'secretary'`; `update errands set status='accepted', claimed_by=v_user, accepted_at=now() where id=p_id and status='sent'`; если строка не обновилась (кто-то успел) → `raise exception 'already_claimed'`;
        - `accepted → done`: только `claimed_by = v_user`; `done_at = now()`;
        - `sent|accepted → declined`: из `sent` — любой `secretary`; из `accepted` — только `claimed_by = v_user`; `decline_reason = nullif(p_reason, '')`, `claimed_by = coalesce(claimed_by, v_user)`;
        - `sent|accepted → cancelled`: только `author_id = v_user`;
        - всё остальное → `raise exception 'bad_transition'`;
      - результат — `to_jsonb(строка после update)`; при `client_request_id` — сохранить в `ingest_batches.result`; вернуть `|| jsonb_build_object('duplicate', false)`.
   8. **RPC `errands_due_escalation(p_now timestamptz default now()) returns int`**, `security definer`, по форме `events_due_reminders`: для заявок `status = 'sent' and escalated_at is null and created_at + make_interval(mins => coalesce((c.settings->'secretary'->>'escalate_after_min')::int, 3)) <= p_now and created_at > p_now - interval '1 hour'` (`c` — `companies` заявки; после долгого простоя старое не спамит), `for update skip locked`: вставить повторные `errand_sent` тем же секретарям, что и триггер (тот же `select` по `profiles`), с `meta.repeat = true` и `title = 'Ещё раз: ' || label`; `escalated_at = p_now`; вернуть число заявок.
   9. **Гранты:** `revoke execute ... from public, anon` на обе функции; `transition_errand` → `authenticated, service_role`; `errands_due_escalation` → только `service_role`; `team_role` — `stable`-безопасна, грантов не требует.
3. `pnpm db:push` в dev, затем `pnpm db:types`. Проверить, что в `lib/supabase/types.ts` появились `errand_status`, `errands`, `transition_errand`, `errands_due_escalation` и что `user_role` содержит `secretary`.
4. **`app/api/push/sweep/route.ts`:** рядом с `events_due_reminders` вызвать `service.rpc("errands_due_escalation")` тем же образом (ошибка логируется, свип не падает); в ответ добавить `escalations: <число>`.
5. **`lib/admin/reset-demo.ts`:** `"errands"` в `ACTIVITY_TABLES` сразу после `"events"` (строки outbox заявок чистятся общим `notification_deliveries`). **`scripts/db-clean.ts`:** `await wipe("errands")` рядом с `wipe("events")`.
6. **pgTAP `021_errands.test.sql`** (по образцу `020`; фикстуры `supabase/seed.sql`: директор …0001, Динара (менеджер) …0002, киоск …0004, Марат (сотрудник) …0007, Айгуль …0008, Ерлан Д. …0006). В начале файла, **до** `set local role authenticated`, сделать Айгуль и Ерлана Д. секретарями: `update profiles set role = 'secretary' where id in ('…0008', '…0006');`. Проверить:
   1. `team_role('secretary')` истинно, `team_role('tv')` и `team_role('director')` ложны;
   2. директор вставляет заявку (`kind='coffee', label='Кофе', note='без сахара', client_request_id=…`) → одна строка `status='sent'`; в outbox **две** строки `errand_sent` (обоим секретарям), у каждой `meta->>'errand_id'` = id заявки, `deliver_after <= now()` (без задержки на окно);
   3. повторный `insert` с тем же `client_request_id` → ошибка уникальности (`throws_ok`), строк по-прежнему одна;
   4. **негатив:** под Маратом `select count(*) from errands` = 0; под Динарой = 0; под киоском = 0; Марат пытается вставить заявку → `throws_ok` (RLS);
   5. Айгуль: `transition_errand(id, 'accepted', null, crid_a)` → `status='accepted'`, `claimed_by`=Айгуль, `accepted_at` не null; директору одна строка `errand_accepted` с `title = 'Принято · Айгуль'`;
   6. Ерлан Д.: `transition_errand(id, 'accepted')` → `throws_ok` с `already_claimed`;
   7. повтор Айгуль с тем же `crid_a` → `duplicate = true`, `accepted_at` не изменился;
   8. Ерлан Д.: `transition_errand(id, 'done')` → `throws_ok` (`bad_transition` — не его заявка); Айгуль: `'done'` → `status='done'`, `done_at` не null, директору `errand_done`;
   9. директор вставляет вторую заявку; Айгуль: `'declined'` с причиной «нет молока» → `status='declined'`, `decline_reason`, директору `errand_declined` с `body = 'Кофе · нет молока'`;
   10. директор вставляет третью; Айгуль пытается `'cancelled'` → `throws_ok`; директор `'cancelled'` → `status='cancelled'`, очередь `errand_sent` этой заявки со `status='queued'` пуста;
   11. директор вставляет четвёртую; `errands_due_escalation(p_now := now() + interval '4 minutes')` под `service_role` (`set local role service_role`) → возвращает 1, у заявки `escalated_at` не null, строк `errand_sent` по ней стало четыре (2 + 2 повторных с `meta->>'repeat' = 'true'`); второй вызов той же минуты → 0; заявка в `accepted` эскалацией не трогается (проверить на первой заявке — она уже `done`, значит счётчик её не учёл);
   12. `fn_rating(now() - interval '7 days', now() + interval '1 minute')` под директором содержит строку Айгуль (секретарь в рейтинге).

### Проверки (обязательные, машинные)
```powershell
pnpm db:push; supabase migration list --linked
pnpm db:types; git diff --stat lib/supabase/types.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm test:rls          # только при наличии Docker; иначе — строка в WORKLOG
```
Все должны завершиться успешно. Красная проверка = чинить в рамках скоупа, не расширяя его.

### Definition of Done (A)
- [ ] Шаги 1–6 выполнены, проверки зелёные.
- [ ] Если Docker нет: миграция проверена скриптом с service role (заявка от директора → под JWT сотрудника `select` возвращает 0 строк; `transition_errand` под секретарём переводит в `accepted`; второй секретарь получает `already_claimed`) — команда и вывод в отчёт.
- [ ] Коммиты: conventional commits, мелкие; `Co-Authored-By` — своей моделью исполнителя.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 015A secretary-db` + Сделано/Коммиты/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод проверок (кратко), открытые вопросы. Файлы не пересказывать.

---

## Фаза B — настройки каталога и роль в приложении (одна сессия)

### Ветка и скоуп
- Ветка: `feat/015b-secretary-settings` от ветки фазы A.
- Трогать только: `lib/settings.ts` (+ тест рядом, если есть), `lib/routes.ts`, `app/(employee)/layout.tsx`, `proxy.ts`, `lib/tasks/queries.ts` (только строка фильтра по роли), `components/people/PersonForm.tsx`, `app/api/people/route.ts`, `components/ether/EtherSection.tsx`, `components/people/TeamList.tsx`, `lib/people/queries.ts` (только если там список ролей), `components/settings/SettingsForm.tsx`, `app/(director)/settings/page.tsx`.

### Шаги
1. **`lib/settings.ts`:**
   ```ts
   export const SecretaryActionSchema = z.object({
     code: z.string().trim().min(1).max(32),
     label: z.string().trim().min(1).max(40),
     icon: z.string().trim().max(8).default(""),        // emoji, as on shop items
     synonyms: z.array(z.string().trim().min(1)).max(12).default([]),  // phase D matcher
   });
   export const SecretarySettingsSchema = z.object({
     escalate_after_min: z.number().int().min(1).max(60).default(3),
     actions: z.array(SecretaryActionSchema).max(12).default(DEFAULT_SECRETARY_ACTIONS),
   });
   ```
   `DEFAULT_SECRETARY_ACTIONS`: `coffee` «Кофе» ☕ (синонимы: кофе, кофейку), `tea` «Чай» 🍵 (чай, чайку), `doctor` «Врач» 🩺 (врач, врача, доктор), `come` «Зайди ко мне» 🚪 (зайди, зайди ко мне, подойди). В `CompanySettingsSchema` — `secretary: SecretarySettingsSchema.prefault({})`. Флага `enabled` нет (§0 п.4). Тест схемы: пустой объект даёт четыре дефолтных действия; коды в массиве уникальны (добавить `.superRefine`).
2. **Роль в маршрутизации и формах.** `lib/routes.ts`: `export const TEAM_ROLES = ["employee", "manager", "shopkeeper", "secretary"] as const satisfies readonly Role[]` и `isTeamRole(role)`; `homeForRole`: `secretary` → `/feed`. `app/(employee)/layout.tsx:15` и `proxy.ts`: пускать `secretary` туда же, куда `employee`/`manager` (через `isTeamRole` или явно — как в файле). `lib/tasks/queries.ts:375`: фильтр `assigneeId` — для `secretary` тоже (`me.role === "employee" || me.role === "secretary"`, либо через хелпер, если он там уместен). `app/api/people/route.ts:13`: `secretary` в enum. `components/people/PersonForm.tsx`: роль «Секретарь» в списке ролей. `components/ether/EtherSection.tsx`, `components/people/TeamList.tsx`: там, где перечислены роли команды, — `TEAM_ROLES`/`isTeamRole`; подпись роли «Секретарь» там, где роли печатаются словом.
3. **Секция в настройках** (`SettingsForm.tsx`, по идиоме существующих секций `conventions`/`vocabulary`): заголовок «Секретарь». Строка-подсказка: кто секретарь — «роль в карточке человека» со ссылкой на `/people`; если активного секретаря нет — текст «Назначь роль «Секретарь» в карточке человека — тогда на Пульсе появится шарик». Список действий: строка = эмодзи (текстовое поле в 1 символ), надпись, кнопка удалить; «Добавить действие» (код генерируется из надписи транслитом или `action_<n>`, пользователю не показывается); поле «Повторить пуш через N минут» (`escalate_after_min`). Синонимы в UI **не** показывать (фаза D решит, нужна ли им правка руками). Сохранение — тем же патчем, что у остальных секций.
4. Ручная проверка на dev: назначить в карточке человека роль «Секретарь» → человек логинится и попадает на `/feed`, видит свои задачи, Эфир, магазин; в настройках переименовать «Кофе» в «Кофе с молоком», добавить «Вода», сохранить, перезагрузить — сохранилось.

### Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### Definition of Done (B)
- [ ] Шаги 1–4 выполнены, проверки зелёные.
- [ ] `grep -rn "\"shopkeeper\"" app lib components proxy.ts` не находит ни одного рукописного списка ролей команды вне `lib/routes.ts` (кроме мест, где `shopkeeper` — именно кладовщик магазина).
- [ ] Коммиты, WORKLOG-запись `015B secretary-settings`, отчёт — как в фазе A.

---

## Фаза C — экраны: шарик и панель у директора, карточки у секретаря, `/secretary`, пуши (рамка; шаги допишет архитектор после приёмки B)

- Ветка: `feat/015c-secretary-ui` от ветки фазы B.
- **Директор, Пульс:** пятый шарик «Секретарь» показывается только когда в компании есть активный `secretary` (`usePeople`); счётчик — активные заявки (`sent` + `accepted`), тон серый пока все `sent`, `--ok` когда есть `accepted`. Панель шарика — сетка 2×2 крупных кнопок каталога; тап = optimistic-строка «Кофе · отправляю…» и тост «Кофе · Отменить» на 5 секунд; **вставка в `errands` — по истечении тоста** (§0 п.6), через `POST /api/errands` (валидация каталога по `company.settings`, снимок `label`, `client_request_id` с клиента, `after(() => kickDeliveries())`). Под кнопками — активная заявка строкой «Кофе · Принято · Айгуль · 2 мин» с квитанцией по `seen_at` строки `errand_sent` («не открывал(а) с 9:14»). Долгий тап по кнопке — шторка второго слоя: примечание. Отмена уже отправленной — `transition_errand(..., 'cancelled')` из строки заявки.
- **Ряд шариков под головой:** пять шариков по 60 px с `gap-4` не влезают в 343 px (iPhone SE): в режиме `row` компонента `OrbitBalls` — `gap-2`, проверить на SE и Redmi-эмуляции; касается и Ленты.
- **Секретарь, Лента:** пятый шарик «Заявки» с живым счётчиком (`sent` + свои `accepted`); панель — стопка карточек: надпись, примечание, время, кнопки «Принял» / «Не могу» (причины-чипами), после принятия — «Готово». Чужая принятая — строка гаснет по Realtime. Ошибка `already_claimed` — тост «Уже приняли».
- **`/secretary`** — один роут для двух ролей (как `/shop`, D-71): директору — история за 30 дней, кто сколько принял, среднее время «отправлено → готово», ссылка на настройки каталога; секретарю — полный список активных и своих закрытых за сегодня. Вкладки в таб-баре нет: вход из панели шарика и из настроек.
- **Пуши:** `errand_sent` открывает `/secretary?e=<id>` со шторкой карточки; квитанции `seen` — существующий `/api/push/seen`; кнопки действий в пуше — через `/api/push/acted` только если он это уже умеет для не-задач, иначе без кнопок.
- **Мысль маскота** на Пульсе: «Айгуль · кофе принят» по строке `errand_accepted` (без рода, §0 п.9); у секретаря в Ленте — «Директор просит: кофе».
- **Не делать:** ТВ, очки, Telegram.
- Проверки — как в фазе B плюс `pnpm smoke:ui` со скриншотами 375 px Пульса и Ленты с пятью шариками.

---

## Фаза D — голос и строка: «кофе», «позови врача» → заявка без /confirm (рамка)

- Ветка: `feat/015d-secretary-voice` от ветки фазы C.
- **Детерминированный матчер до модели**, в `POST /api/voice/parse` (через него идут голос, строка и Web Share): фраза ≤ 3 слов после нормализации (нижний регистр, без знаков), **без имени из ростера** (существующий `matchName`), совпавшая с `label` или `synonyms` действия из `company.settings.secretary.actions` — ответ `{ errand: { code, label, note } }` без вызова модели; остаток фразы после совпавшего слова — в `note` («кофе без сахара» → `coffee` + «без сахара»). Иначе — парсер как сегодня. «Свари кофе Марату к 15:00» остаётся задачей. Когда активного секретаря нет — матчер выключен.
- Клиент: на `errand` в ответе — тот же тост 5 секунд и `POST /api/errands` с `audio_path`, `source_transcript` и `inbox_item_id` (аудио уже в Storage — принцип 5).
- **Схема сущностей парсера, промпт, few-shot и evals не трогаются**; матчер покрыт unit-тестами (совпадение по label, по синониму, с остатком, отказ при имени, отказ при 4+ словах, отказ без секретаря, казахское «шай» только если добавлено в синонимы).
- Проверки — фазы B плюс `pnpm eval:parser` для подтверждения, что прогон не изменился (гейты 97%/90%).
