# tasks/014-calendar-events.md — Календарь и мероприятия: голосом через ассистента, участники, напоминание на Пульсе, в Ленте и на ТВ

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай.

> Источник: заказ владельца (2026-09-18): «модуль календаря и мероприятий: чтобы директор через ассистента мог создавать новые события и добавлять к ним сотрудников; напоминание через главный экран и ТВ-режим». Анализ архитектора и решения — D-78. Этот файл — единственный текст наряда. Там, где docs/DATABASE.md и docs/BACKEND.md §10 говорят про pg_cron-джобы (`reminders_send`, `publish_scheduled`), прав D-78: единственный существующий минутный тик — Vercel cron `POST /api/push/sweep`, напоминания мероприятий выдаёт он.

Наряд состоит из **четырёх фаз = четырёх сессий и веток**: A (БД) → B (парсер и /confirm) → C (страница, Пульс, Лента) → D (ТВ). Каждая фаза — отдельная запись в WORKLOG и отдельный отчёт; следующую фазу начинать только после приёмки предыдущей.

---

## 0. Решения, на которых стоит наряд (D-78; исполнителю — к сведению, не обсуждать)

1. **Мероприятие = своя сущность парсера `event` и таблицы `events` + `event_participants`.** Таблица `reminders` не трогается. «Собрание/планёрка/встреча с датой и временем» — это `event`, а не `announcement`: контракт П2 и evals `fs-02` меняются сознательно (см. фазу B).
2. **Создание — только через существующий конвейер**: голос или текст → парсер → /confirm → `confirm_voice_batch`. Отдельной формы «новое мероприятие» нет: кнопка «+» на `/calendar` открывает /confirm с пустой карточкой мероприятия (как `startManual` для задачи). Один парсер на оба входа (принцип 1).
3. **Участники — список, не копии.** В отличие от задач (D-02), одно мероприятие = одна строка и N участников. Модель отдаёт имена (`participant_names`, дословно из ростера, как `assignee_name`, D-56), id проставляет постобработка; «всем / вся команда» → `everyone: true`, участники материализуются в БД на момент создания. Автор — всегда участник со статусом `going`. Ненайденное имя не блокирует отправку (жёлтый чип «не нашёл»), отсутствие времени — блокирует (`blocked: "time_missing"`).
4. **Видимость: директор — всё по компании; сотрудник и менеджер — только свои мероприятия** (автор или участник); роль `tv` не читает ни `events`, ни `event_participants` — стена получает данные через `tv_summary()` и `tv_events`.
5. **Доставка — через outbox с квитанциями (принцип 8), четыре события:** `event_invite` (при добавлении участника; ждёт окна доставки), `event_reminder` (за `remind_before_min` минут до начала, по умолчанию 30; уходит сразу — время выбрал директор), `event_moved` и `event_cancelled` (ждут окна). «Не смогу» участника → `event_declined` автору сразу.
6. **Тик напоминаний — RPC `events_due_reminders(p_now)`**, которую минутный свип `POST /api/push/sweep` зовёт service-role-клиентом перед рассылкой. Идемпотентно через `events.reminded_at`; тот же вызов пишет строку `tv_events` вида `event` — стена узнаёт о мероприятии тем же каналом, что о задачах.
7. **Ответ участника — две кнопки: «Буду» / «Не смогу» (причина чипами).** RPC `respond_event` — абсолютное состояние, повтор безвреден, `client_request_id` не заводится (то же исключение из принципа 7, что в D-76 §3). Директор видит на карточке «4 из 6 будут, Марат не сможет: занят срочным».
8. **Главный экран.** На Пульсе и в Ленте — четвёртый шарик «Календарь» (число мероприятий сегодня впереди), панель — список «сегодня / завтра» с переходом на `/calendar`. Напоминание — мысль маскота («Через 30 минут — «Планёрка», 6 человек») по Realtime-изменению `reminded_at`, лицо `alert`, если мероприятие начинается в ближайшие 15 минут. Во вступительной реплике директора — ближайшее мероприятие дня.
9. **ТВ.** Бегущая строка получает строки «Сегодня 15:00 · Планёрка · 6 чел.» из `tv_summary().events`; за `remind_before_min` до начала лицо говорит «Скоро — «Планёрка»» (строка `tv_events` вида `event`); сцена «часы» печатает ближайшее мероприятие под датой. Гость (D-33) названий не видит — «Мероприятие»; негатива нет по определению.
10. **Не строится в v1** (бэклог): месячная сетка (v1 — лента по дням на 30 дней вперёд), повторяющиеся мероприятия (`recurrence` остаётся для задач), редактирование участниками, перенос за пределы правки времени, Telegram-ярус для мероприятий.

---

## Контекст (читать только это, общий для всех фаз)

- `CLAUDE.md`: принципы 1, 2, 5, 7 (и исключение §0 п.7), 8; регламент п.4 (миграции), п.5 (evals при правке промпта), п.6 (время).
- `docs/AI.md` §3 (контракт сущностей) и §4 (few-shot) — чтобы понять формат, не править (правит архитектор при приёмке).
- Код, который трогаем (читать по мере шагов, не заранее): `supabase/migrations/20260917200000_notes.sql` (последняя редакция `confirm_voice_batch` — копировать тело оттуда целиком), `supabase/migrations/20260910180000_delivery_outbox.sql` (триггеры outbox — образец `meta`), `supabase/migrations/20260917170000_shop_fixes.sql` (последняя редакция `notification_deliveries_deliver_after` — копировать оттуда), `supabase/migrations/20260917190000_tv_events.sql` (`tv_emit`, check-constraint `tv_events.kind`, гранты), `supabase/migrations/20260917192000_tv_day_pulse.sql` (последняя редакция `tv_summary` — копировать оттуда), `supabase/migrations/20260910120000_realtime_publication.sql` (как добавлять таблицу в публикацию), `supabase/tests/001_rls_tasks.test.sql` (id демо-пользователей), `supabase/tests/019_tv_state.test.sql` (свежий образец pgTAP), `app/api/push/sweep/route.ts`, `lib/supabase/service.ts`, `lib/ai/schema.ts`, `lib/ai/prompt.ts`, `lib/ai/examples.ts`, `lib/ai/postprocess.ts`, `lib/matchName.ts` (`matchName`, `AssigneeMatch`), `tests/ai/parser_evals.jsonl`, `tests/ai/eval.ts`, `lib/store/ingest.ts`, `app/api/voice/confirm/route.ts`, `components/confirm/format.ts`, `components/confirm/EntityCard.tsx`, `components/confirm/DeadlineSheet.tsx`, `components/confirm/AssigneePicker.tsx`, `components/confirm/useRoster.ts`, `components/ui/datetime/DateTimeField.tsx`, `lib/datetime/calendar.ts`, `lib/ai/time.ts` (`humanAqtobe`), `lib/tasks/status-text.ts` (`pluralRu`), `lib/tasks/queries.ts` (`useMe`, образец `select` с join), `lib/tasks/mutations.ts` (образец `useMutation` с optimistic-патчем и тостом), `lib/realtime/useRealtimeQuery.ts`, `lib/ether/queries.ts` + `lib/pulse/ether.ts` (образец «второго источника новостей» для маскота), `components/pulse/useSpeech.ts`, `lib/pulse/mood.ts`, `app/(director)/pulse/page.tsx`, `app/(employee)/feed/page.tsx`, `components/pulse/OrbitBalls.tsx`, `app/shop/layout.tsx` + `app/shop/page.tsx` (образец страницы для всех ролей), `components/tasks/AudioOriginal.tsx`, `components/ui/Sheet.tsx`, `components/ui/Chip.tsx`, `components/ui/Button.tsx`, `components/ui/Row.tsx`, `components/ui/Toast.tsx`, `components/ui/PageSkeletons.tsx`, `app/(director)/settings/page.tsx`, `lib/tv/feed.ts`, `lib/tv/voice.ts`, `lib/tv/ticker.ts`, `lib/tv/queries.ts`, `components/tv/TvClock.tsx`, `lib/admin/reset-demo.ts`, `scripts/db-clean.ts`, `scripts/smoke-ui.ts`.
- Решения: D-02 (копии задач — НЕ применять к мероприятиям), D-15 (конвенции времени), D-33 (маска гостя), D-38/D-51 (окно доставки), D-45 (негатив на стену не выносится), D-52 §14 (поручение без имени — task), D-56 (id проставляет сервер), D-75 (заметки — образец «своей сущности»), D-76 §3 (абсолютная команда без `client_request_id`), D-78 (этот наряд).
- Факты о среде: dev-проект Supabase `qobsbjugromdwfdodwwa`; `pnpm test:rls` требует Docker Desktop — если Docker нет, pgTAP не запускать, а в WORKLOG написать «pgTAP 014 не выполнялся (нет Docker)» и проверить миграцию скриптом (см. DoD). Рабочая копия одна на все сессии: **`git add` только по путям из скоупа фазы**, никогда `git add -A`; `lib/supabase/types.ts` после `pnpm db:types` коммитится целиком — это норма. Перед мутирующими смоуками на dev — проверить, что владелец не работает (`ai_logs` за последние 30 минут).
- Ветки — от **текущего HEAD** (не от `main`: `main` отстаёт). Старые миграции не править. Секретов в код не вносить. `db push` — только в dev.

---

## Фаза A — таблицы `events` / `event_participants`, RLS, outbox, RPC, тик напоминаний (одна сессия)

### Ветка и скоуп
- Ветка: `feat/014a-calendar-db`.
- Трогать только: `supabase/migrations/20260918150000_calendar_events.sql` (новая), `supabase/tests/020_calendar.test.sql` (новый), `lib/supabase/types.ts` (через `pnpm db:types`), `app/api/push/sweep/route.ts`, `lib/admin/reset-demo.ts`, `scripts/db-clean.ts`.

### Шаги
1. **Миграция `20260918150000_calendar_events.sql`** (одна на фазу; в шапке — по строке на пункт «зачем», ссылки на D-78, D-33, D-45):
   1. Таблицы:
      ```sql
      create table events (
        id                uuid primary key default gen_random_uuid(),
        company_id        uuid not null references companies,
        author_id         uuid not null references profiles,
        title             text not null,
        body              text,                       -- agenda / «не опаздывать»
        location          text,
        starts_at         timestamptz not null,
        ends_at           timestamptz,                -- null = no fixed end
        remind_before_min int not null default 30 check (remind_before_min between 0 and 1440),
        everyone          boolean not null default false,  -- display only; participants are materialised
        reminded_at       timestamptz,                -- set once by events_due_reminders; reset when starts_at moves
        cancelled_at      timestamptz,
        audio_path        text,                       -- voice bucket; never edited
        source_transcript text,
        inbox_item_id     uuid references inbox_items on delete set null,
        created_at        timestamptz not null default now(),
        updated_at        timestamptz not null default now()
      );

      create table event_participants (
        event_id     uuid not null references events on delete cascade,
        user_id      uuid not null references profiles on delete cascade,
        status       text not null default 'invited' check (status in ('invited','going','declined')),
        reason       text,                            -- «Не смогу» — why
        responded_at timestamptz,
        created_at   timestamptz not null default now(),
        primary key (event_id, user_id)
      );
      ```
      Комментарии к таблицам: «a meeting or an outing the director set by voice; participants are one row each (not copies, unlike tasks D-02)» и «who is invited and what they answered; the author is always a participant with status going». Триггер `moddatetime(updated_at)` на `events` по образцу `notes`.
   2. Индексы: `events_company_starts_idx on events (company_id, starts_at) where cancelled_at is null`; `events_due_idx on events (starts_at) where reminded_at is null and cancelled_at is null`; `event_participants_user_idx on event_participants (user_id)`.
   3. **Две security-definer-функции видимости** (чтобы политики двух таблиц не ссылались друг на друга — Postgres падает с «infinite recursion detected in policy»), обе `stable`, `set search_path = public`:
      - `is_event_participant(p_event uuid) returns boolean` — `exists (select 1 from event_participants where event_id = p_event and user_id = auth.uid())`;
      - `can_see_event(p_event uuid) returns boolean` — `exists (select 1 from events e where e.id = p_event and e.company_id = auth_company_id() and (auth_role() = 'director' or e.author_id = auth.uid() or is_event_participant(p_event)))`.
      `revoke execute … from public, anon; grant execute … to authenticated`.
   4. RLS (`enable row level security` на обеих):
      - `events_select`: `company_id = auth_company_id() and auth_role() <> 'tv' and (auth_role() = 'director' or author_id = auth.uid() or is_event_participant(id))`;
      - `events_update` (`using` и `with check`): `company_id = auth_company_id() and auth_role() = 'director'` — директор правит заголовок, время, место, `body`, `remind_before_min`, `cancelled_at` прямым `update`; insert/delete-политик нет (создание — `confirm_voice_batch`, физическая чистка — `db:clean`);
      - `event_participants_select`: `auth_role() <> 'tv' and can_see_event(event_id)`; политик на запись нет вовсе (только RPC).
   5. Публикация Realtime: `events` и `event_participants` — тем же идемпотентным блоком, что в `20260910120000_realtime_publication.sql`.
   6. **Триггеры outbox** (образец `meta` — `notify_outbox_task` в `20260910180000`; url всегда `'/calendar?e=' || event_id`; время в тексте — `to_char(starts_at at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI')`):
      - `notify_outbox_event_participant` — `after insert on event_participants`: если `new.user_id <> author_id` мероприятия и оно не отменено — строка `event_invite` (`title: 'Приглашение'`, `body: left(e.title, 80) || ' · ' || <DD.MM HH24:MI>`);
      - `notify_outbox_event` — `after update on events`: (а) `new.starts_at is distinct from old.starts_at` и не отменено → всем участникам кроме автора со `status <> 'declined'` строка `event_moved` (`title: 'Перенос'`, `body: left(title,80) || ' · ' || <новое время>`); (б) `new.cancelled_at is not null and old.cancelled_at is null` → всем участникам кроме автора строка `event_cancelled` (`title: 'Отмена'`, `body: left(title,80)`);
      - `events_reset_reminder` — `before update on events`: если `new.starts_at is distinct from old.starts_at` — `new.reminded_at := null` (напоминание сработает заново по новому времени).
   7. **`notification_deliveries_deliver_after`** — `create or replace` с телом из `20260917170000_shop_fixes.sql`, в список видов, ждущих окна, добавить `'event_invite', 'event_moved', 'event_cancelled'` (`event_reminder` и `event_declined` уходят сразу — в список НЕ добавлять). Триггер пересоздавать не нужно — он зовёт функцию по имени.
   8. **`tv_events.kind`**: расширить check-constraint значением `'event'`: `alter table tv_events drop constraint tv_events_kind_check; alter table tv_events add constraint tv_events_kind_check check (kind in ('task_sent','task_accepted','task_review','task_done','points','announcement','merch','event'));` (имя констрейнта проверить запросом `select conname from pg_constraint where conrelid = 'tv_events'::regclass and contype = 'c'` — если оно другое, использовать его).
   9. **`confirm_voice_batch`** — `create or replace` с телом из `20260917200000_notes.sql` (скопировать целиком, менять только перечисленное):
      - новые переменные: `v_event_ids uuid[] := '{}'::uuid[]`, `v_starts timestamptz`, `v_pid uuid`;
      - ветка `elsif v_kind = 'event' then` (ставить перед `elsif v_kind = 'note'`):
        ```sql
        v_starts := nullif(v_entity->>'starts_at_iso', '')::timestamptz;
        if v_starts is null then
          raise exception 'event_time_required' using errcode = 'P0001';
        end if;
        insert into events (company_id, author_id, title, body, location, starts_at, ends_at,
                            remind_before_min, everyone, audio_path, source_transcript, inbox_item_id)
        values (v_company, v_user, v_entity->>'title', v_entity->>'body', v_entity->>'location',
                v_starts, nullif(v_entity->>'ends_at_iso', '')::timestamptz,
                coalesce((v_entity->>'remind_before_min')::int, 30),
                coalesce((v_entity->>'everyone')::boolean, false),
                nullif(payload->>'audio_path', ''), nullif(payload->>'transcript', ''), v_inbox)
        returning id into v_id;
        v_event_ids := v_event_ids || v_id;
        -- the author is always in, and always going
        insert into event_participants (event_id, user_id, status, responded_at)
        values (v_id, v_user, 'going', p_now);
        if coalesce((v_entity->>'everyone')::boolean, false) then
          insert into event_participants (event_id, user_id)
          select v_id, p.id from profiles p
           where p.company_id = v_company and p.is_active and p.role <> 'tv' and p.id <> v_user
          on conflict do nothing;
        else
          for v_pid in
            select value::uuid from jsonb_array_elements_text(coalesce(v_entity->'participant_ids', '[]'::jsonb))
          loop
            -- somebody else's company or an inactive person is skipped silently (D-56: ids are the server's)
            insert into event_participants (event_id, user_id)
            select v_id, p.id from profiles p
             where p.id = v_pid and p.company_id = v_company and p.is_active and p.role <> 'tv' and p.id <> v_user
            on conflict do nothing;
          end loop;
        end if;
        ```
      - в `v_result` добавить `'event_ids', to_jsonb(v_event_ids)`.
   10. **`respond_event(p_event uuid, p_status text, p_reason text default null) returns event_participants`** — `security definer set search_path = public`: `p_status` только `'going'` или `'declined'` (иначе `raise exception 'bad_status'`); строка участника с `user_id = auth.uid()` и `event_id = p_event` обязана существовать и мероприятие не отменено (иначе `'forbidden'`); `update … set status = p_status, reason = case when p_status = 'declined' then nullif(p_reason,'') else null end, responded_at = now() returning *`; при `declined` — строка outbox автору мероприятия `event_declined` (`title: 'Не сможет'`, `body: <имя без фамилии> || ' · ' || left(title, 80) || coalesce(': ' || reason, '')`), если автор ≠ отвечающий.
   11. **`set_event_participants(p_event uuid, p_add uuid[] default '{}', p_remove uuid[] default '{}') returns void`** — `security definer`, роль `director` и мероприятие своей компании (иначе `'forbidden'`); `insert … select unnest(p_add)` с той же проверкой профиля, что в п.9, `on conflict do nothing`; `delete from event_participants where event_id = p_event and user_id = any(p_remove) and user_id <> <author_id>`.
   12. **`events_due_reminders(p_now timestamptz default now()) returns int`** — `security definer set search_path = public`, **только service_role** (revoke from public, anon, authenticated). Для каждого мероприятия: `cancelled_at is null and reminded_at is null and starts_at - remind_before_min * interval '1 minute' <= p_now and starts_at > p_now - interval '1 hour'` (после долгого простоя старые не спамят) — с `for update skip locked`:
       - строки outbox `event_reminder` всем участникам со `status <> 'declined'` (включая автора): `title: 'Скоро'`, `body: left(title, 80) || ' · ' || to_char(starts_at at time zone 'Asia/Aqtobe', 'HH24:MI') || coalesce(' · ' || location, '')`;
       - `perform tv_emit(company_id, 'event', null, null, title, null, null)` — гость получает `title = null` («Мероприятие», D-33);
       - `update events set reminded_at = p_now where id = …`.
       Возвращает число обработанных мероприятий.
   13. `grant execute`: `respond_event`, `set_event_participants` → `authenticated, service_role`; `events_due_reminders` → только `service_role`; `revoke … from public, anon` на все три — по схеме грантов `20260917190000`.
   14. **`tv_summary(p_guest boolean)`** — `create or replace` с телом из `20260917192000_tv_day_pulse.sql` (скопировать целиком), добавить ключ:
       ```sql
       'events', coalesce((
         select jsonb_agg(jsonb_build_object(
                  'id', e.id,
                  'title', case when p_guest then null else e.title end,
                  'starts_at', e.starts_at,
                  'location', case when p_guest then null else e.location end,
                  'people', (select count(*) from event_participants ep where ep.event_id = e.id and ep.status <> 'declined')
                ) order by e.starts_at)
           from (
             select * from events e
              where e.company_id = v_company and e.cancelled_at is null
                and e.starts_at >= v_now - interval '30 minutes'
                and e.starts_at < v_day + interval '2 days'
              order by e.starts_at limit 6
           ) e
       ), '[]'::jsonb)
       ```
       (`v_day` — начало суток компании, уже есть в функции).
2. `pnpm db:push` в dev, затем `pnpm db:types`.
3. **`app/api/push/sweep/route.ts`**: перед `sweepDeliveries()` — `const service = createServiceSupabase(); const due = await service.rpc("events_due_reminders"); if (due.error) console.error("events_due_reminders failed:", due.error.message);` (ошибка тика не должна ронять свип); в ответ `apiOk({ ...(await sweepDeliveries()), reminders: due.data ?? 0 })`.
4. **`lib/admin/reset-demo.ts`**: `"events"` в `ACTIVITY_TABLES` сразу после `"notes"` (участники и outbox-строки без `task_id` — каскадом/отдельно: `notification_deliveries` уже в списке). **`scripts/db-clean.ts`**: `await wipe("events")` рядом с `wipe("notes")`.
5. **pgTAP `020_calendar.test.sql`** (по образцу `019`; id директора, менеджера, Марата и Айгуль — из `001_rls_tasks.test.sql`, киоск `tv` — `10000000-0000-0000-0000-000000000004`):
   1. директор: `confirm_voice_batch` с сущностью `{"kind":"event","title":"Планёрка","starts_at_iso":"<завтра 10:00+05:00>","ends_at_iso":null,"body":null,"location":"в офисе","remind_before_min":30,"everyone":false,"participant_ids":["<марат>","<айгуль>"],"source_span":"…"}` → в `events` одна строка, `result->'event_ids'` длины 1, участников 3 (директор `going`, Марат и Айгуль `invited`), в `notification_deliveries` две строки `event_invite` (Марату и Айгуль, автору — нет);
   2. повтор с тем же `client_request_id` → `duplicate = true`, строк по-прежнему одна;
   3. сущность `event` без `starts_at_iso` (новый `client_request_id`) → `throws_ok` `event_time_required`;
   4. **негатив видимости**: Марат `select count(*) from events` = 1; сотрудник не из участников (Ерлан) = 0; менеджер (не участник) = 0; `tv` = 0; Марат `select count(*) from event_participants` = 3 (видит состав своего мероприятия); Ерлан = 0;
   5. Марат: `respond_event(<id>, 'declined', 'Занят срочным')` → `status = 'declined'`, `reason` записан; в outbox появилась строка `event_declined` для директора; Марат: `respond_event(<id>, 'going')` → `going`, `reason` null; Ерлан: `respond_event(<id>, 'going')` → `forbidden`; Марат: `respond_event(<id>, 'maybe')` → `bad_status`;
   6. директор: `set_event_participants(<id>, array[<ерлан>], array[<айгуль>])` → участников по-прежнему 3 (Ерлан добавлен, Айгуль удалена), outbox `event_invite` Ерлану; Марат зовёт `set_event_participants` → `forbidden`;
   7. директор: `update events set starts_at = starts_at + interval '1 hour'` → `reminded_at` null (уже был), в outbox строки `event_moved` участникам кроме автора; Марат делает такой же `update` → 0 строк;
   8. **тик**: `set role`/claims → service_role (как в тестах с `security definer`, если образца нет — вызывать под суперпользователем теста, гранты проверить отдельным `throws_ok` под сотрудником: `permission denied`); `select events_due_reminders(<starts_at - 20 min>)` = 1 → `reminded_at` не null, outbox `event_reminder` для каждого участника со статусом ≠ `declined` (включая директора), в `tv_events` одна строка `kind = 'event'` с `payload->>'title' = 'Планёрка'` и `payload_guest->>'title'` null; повторный вызов = 0 и новых строк нет;
   9. `tv`: `tv_summary(false)->'events'` — массив длины 1 с `title = 'Планёрка'`, `people = 3`; `tv_summary(true)->'events'->0->>'title'` null;
   10. директор: `update events set cancelled_at = now()` → outbox `event_cancelled` участникам; `tv_summary(false)->'events'` пуст.

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
- [ ] Шаги 1–5 выполнены, проверки зелёные.
- [ ] Если Docker нет: миграция проверена скриптом на dev (логин директора → `confirm_voice_batch` с `event`; логин Марата → `select` из `events` = 1, `respond_event` проходит; логин Ерлана → `select` пуст, `respond_event` падает `forbidden`; service role → `events_due_reminders(<starts_at - 20 min>)` = 1, строки outbox и `tv_events` есть) — команда и вывод в отчёт; после проверки мероприятие отменить/удалить.
- [ ] Коммиты: conventional commits, мелкие; `Co-Authored-By` — своей моделью исполнителя.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 014A calendar-db` + Сделано/Коммиты/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод проверок (кратко), открытые вопросы.

---

## Фаза B — сущность `event` в парсере, постобработка участников, карточка на /confirm (одна сессия)

### Ветка и скоуп
- Ветка: `feat/014b-calendar-parser`.
- Трогать только: `lib/ai/schema.ts`, `lib/ai/prompt.ts`, `lib/ai/examples.ts`, `lib/ai/postprocess.ts` (+ `lib/ai/postprocess.test.ts`), `tests/ai/parser_evals.jsonl`, `tests/ai/eval.ts`, `lib/store/ingest.ts` (+ `lib/store/ingest.test.ts`, если есть), `app/api/voice/confirm/route.ts`, `components/confirm/format.ts`, `components/confirm/EntityCard.tsx`, `components/confirm/WhenSheet.tsx` (новый), `components/confirm/ParticipantsPicker.tsx` (новый).

### Шаги
1. **`lib/ai/schema.ts`**:
   ```ts
   const ModelEventEntitySchema = z.strictObject({
     kind: z.literal("event"),
     title: z.string(),                       // «Планёрка», «Встреча с Альфой» — без даты и имён
     body: z.string().nullable(),             // «не опаздывать», повестка
     location: z.string().nullable(),         // «в офисе», «у Альфы»
     starts_at_iso: z.string().nullable(),    // ISO 8601, explicit +05:00
     ends_at_iso: z.string().nullable(),
     time_confidence: z.number().nullable(),  // < 0.8 — yellow chip; date without time = 0.5
     time_source_text: z.string().nullable(), // «в пятницу», «завтра в десять»
     participant_queries: z.array(z.string()), // verbatim mentions; [] if none
     participant_names: z.array(z.string()),   // roster full_name copied verbatim (D-56)
     everyone: z.boolean(),                    // «всем», «вся команда»
     remind_before_min: z.number().nullable(), // only on explicit «напомни за час»
     source_span: z.string(),
   });
   export const EventEntitySchema = ModelEventEntitySchema.extend({ participant_ids: z.array(z.string()) });
   ```
   Добавить в оба union (`EntitySchema` — `EventEntitySchema`, `ModelEntitySchema` — модельную), экспортировать `EventEntity`. В `withAssigneeId` — для `event` добавлять `participant_ids: []` (проверка `"participant_names" in entity`). Нуллабельных полей — 7, лимит API 16 соблюдён. Тест `schema.test.ts` — если он перечисляет kinds, добавить `event`.
2. **`lib/ai/prompt.ts`**:
   1. строку `announcement` заменить на: `- announcement — объявление всем (новость, правило, общая информация). Собрание или встреча с датой/временем — это event, не announcement.`;
   2. после `note` добавить: `- event — мероприятие с датой и временем: собрание, планёрка, совещание, встреча, созвон, выезд, обучение, корпоратив, день рождения. Участники — по именам из ростера или «всем».`;
   3. правило 17: «МЕРОПРИЯТИЕ. Есть слово-маркер (собрание, планёрка, совещание, встреча, созвон, выезд, обучение, корпоратив) и дата/время → event. title — суть без даты и имён («Планёрка», «Встреча с Альфой»). Участники: названные имена → participant_queries (дословно) и participant_names (full_name из ростера, как для assignee_name); «всем / вся команда / весь офис» → everyone: true и пустые списки; никого не названо и не «всем» → пустые списки, everyone: false (мероприятие директора). Место после «в / на / у» (в офисе, на складе, у Альфы) → location. «напомни за час / за 15 минут» → remind_before_min: 60 / 15, иначе null. Дата без времени («в пятницу корпоратив») → starts_at_iso с 09:00 этого дня и time_confidence: 0.5, time_source_text — слова о дате. Ни даты, ни времени → starts_at_iso: null. Поручение вокруг мероприятия («Марат, подготовь зал») — отдельный task. «Каждый понедельник планёрка» → recurrence, как раньше. «Напомни мне позвонить …» — reminder, не event.»
3. **`lib/ai/examples.ts`**: в П2 объявление заменить на мероприятие:
   ```ts
   {
     kind: "event",
     title: "Общее собрание",
     body: "Не опаздывать",
     location: "в офисе",
     starts_at_iso: "2026-08-14T10:00:00+05:00",
     ends_at_iso: null,
     time_confidence: 0.95,
     time_source_text: "завтра в десять",
     participant_queries: [],
     participant_names: [],
     everyone: true,
     remind_before_min: null,
     source_span: "всем: завтра в десять общее собрание в офисе, не опаздывать",
   }
   ```
   (порядок сущностей — как в речи; комментарий П2 переименовать: «мероприятие всем + 2 задачи + очки»). Добавить П12: «Встреча с Альфой в четверг в три у них в офисе, идут Марат и Айгуль. Напомни за час» → одна `event` (`title: "Встреча с Альфой"`, `location: "у них в офисе"`, `starts_at_iso: "2026-08-20T15:00:00+05:00"` — четверг после 13.08.2026 четверга = 20.08, `time_confidence: 0.9`, `participant_queries: ["Марат","Айгуль"]`, `participant_names` — full_name Марата и Айгуль из ростера примеров, `everyone: false`, `remind_before_min: 60`). Контекст примера — тот же четверг 13.08.2026 16:32. Тест `examples.test.ts` — если проверяет валидность по схеме, он поймает опечатки.
4. **`lib/ai/postprocess.ts`**:
   - тип `ParticipantMatch = { query: string; name: string | null; match: AssigneeMatch }`; в `PostprocessedEntity` добавить `participants?: ParticipantMatch[]`; `BlockedReason` расширить `"time_missing"`;
   - в список валидируемых ISO-полей добавить `starts_at_iso`, `ends_at_iso` (невалидная дата → null; для `starts_at_iso` заодно `time_confidence = null`);
   - для `event`: по каждому `participant_names[i]` вызвать `matchName({ assignee_name: name, assignee_id: null, assignee_queries: [participant_queries[i] ?? name], assignee_confidence: 0.9 }, roster, matchingConfig)`; `participants` — результат; `participant_ids` — уникальные `user_id` совпавших (`status === "matched"`); если `starts_at_iso === null` → `blocked = "time_missing"`. Ненайденные имена отправку не блокируют (§0 п.3).
   - Тесты (`postprocess.test.ts`): два имени из ростера → два id; одно имя не найдено → один id и `participants[1].match.status !== "matched"`; нет времени → `blocked = "time_missing"`; невалидный `starts_at_iso` → null и блок.
5. **`tests/ai/parser_evals.jsonl`**: (а) в `fs-02` первую ожидаемую сущность заменить на `{"kind": "event"}`; `r-016-mini` — проверить фактический вывод: если модель теперь выдаёт `event` для «Пятницу общее собрание в 9», добавить `{"kind": "event"}` первым ожидаемым (сейчас объявление там не ожидается, и лишняя сущность ломает счёт); (б) десять кейсов `ev-01…10`: планёрка завтра в 10 со всеми (`everyone` не проверяется — только kind); встреча с Альфой в четверг в 15, Марат и Айгуль (`kind: event`); «созвон с банком сегодня в 16:30» (event без участников); «в пятницу корпоратив» (event; `deadline_iso` не проверять); «завтра собрание в 10, Марат подготовь зал» (event + task u-003); «напомни мне завтра позвонить в банк» (reminder, не event); «каждый понедельник в 9 планёрка» (recurrence); казахский «ертең сағат онда жиналыс, бәріне» (event); «встреча с Сакеном Абаевым в 12» с именем вне ростера (event); телеграф `typed` «совещание 15:00 Марат Ерлан» (event). Для `event` в `expected` — `kind` и, где время однозначно, `deadline_iso` (см. п.6).
6. **`tests/ai/eval.ts`**: в функции, отдающей дедлайн сущности (`deadline_iso` для task, `remind_at_iso` для reminder), добавить `event → starts_at_iso`, чтобы `expected.deadline_iso` проверял время мероприятия. Больше ничего не менять.
7. **Прогон `pnpm eval:parser`** — результат (assignee %, F1, число кейсов) целиком в отчёт и WORKLOG. Гейты: assignee ≥97%, F1 ≥90%. Красный гейт — чинить промпт/пример, не evals.
8. **`app/api/voice/confirm/route.ts`**: в `SERVICE_FIELDS` добавить `"participants"` (поле постобработки, в RPC не едет; `participant_ids` — едет). Ошибку `event_time_required` маппить в `apiError(400, "event_time_required", "Не понял, когда мероприятие — выбери время")`.
9. **`lib/store/ingest.ts`**: в `EntityPatch` добавить `Omit<EventEntity, "kind">` и `participants: ParticipantMatch[]`; действие `startManualEvent()` по образцу `startManual`: сущность `{ kind: "event", title: transcript, body: null, location: null, starts_at_iso: null, ends_at_iso: null, time_confidence: null, time_source_text: null, participant_queries: [], participant_names: [], everyone: false, remind_before_min: null, participant_ids: [], source_span: transcript, participants: [], blocked: "time_missing" }`, `source: "typed"`, `stage: "confirm"`. `isSendable` менять не нужно — `blocked` уже блокирует. Чистая функция `describeParticipants(entity, nameOf): string` → «Все» / «Только я» / «Марат, Айгуль» / «Марат +2» (первое имя + счётчик, если больше двух) — с тестом (четыре случая).
10. **`components/confirm/format.ts`**: `KIND_FORMS.event = ["мероприятие", "мероприятия", "мероприятий"]`; `KIND_ORDER` — `event` сразу после `announcement`.
11. **`components/confirm/WhenSheet.tsx`** — копия `DeadlineSheet` с отличиями: заголовок «Когда?», пресеты «Сегодня 15:00», «Завтра 9:00», «Завтра 14:00» (без «Без срока»), `DateTimeField defaultHm="10:00"`, `onPick(iso: string)` (null невозможен).
12. **`components/confirm/ParticipantsPicker.tsx`** — `Sheet` с заголовком «Кто участвует?»: сверху строка-переключатель «Все сотрудники» (`Row`/кнопка с галкой), ниже список `useRoster()` с чекбоксами (цель 44 px, имя + должность); пропсы `{ open, onClose, everyone, selectedIds, onDone: (next: { everyone: boolean; ids: string[] }) => void }`; при `everyone` чекбоксы неактивны; кнопка «Готово» внизу.
13. **`components/confirm/EntityCard.tsx`** для `kind === "event"`:
    - иконка `KindIcon.event` — календарь (контурный прямоугольник с двумя «ушками»), цвет `var(--accent)`; заголовок редактируется как у task;
    - строка чипов: **«Когда»** — `Chip` с текстом `formatDeadline(starts_at_iso)` без «до» (или «Когда?» тоном `danger`, если null; тон `warn`, если `time_confidence < 0.8`, с ` · „${time_source_text}“`), тап → `WhenSheet` → `onPatch({ starts_at_iso, time_confidence: 1, time_source_text: null, blocked: undefined })`; **«Кто»** — `Chip` с `describeParticipants(...)`, тап → `ParticipantsPicker` → `onPatch({ everyone, participant_ids })`; **«Где»** — `Chip` с `location` или «Место?» (тон `neutral`), тап переводит карточку в inline-редактирование поля `location` (обобщить существующий `field`/`startEditing`: ключ `"title" | "location"`); под чипами, если у какого-то участника `match.status !== "matched"` — строка `warn`: «Не нашёл в списке: Сакен» (имена через запятую);
    - в развёрнутом виде — `body`, если есть (не редактируется в v1).
14. Ручная проверка на dev через `TextSheet`: «планёрка завтра в 10 со всеми» → /confirm с карточкой мероприятия, «Кто: Все», «Когда: завтра 10:00»; «Отправить» → строка в `events`, участников = все активные; «встреча с Альфой в четверг в 15, идут Марат и Айгуль» → «Кто: Марат, Айгуль»; «корпоратив в пятницу» → чип «Когда» жёлтый, 09:00, тап меняет время; «совещание» без времени → «Когда?» красный, кнопка отправки неактивна до выбора времени.

### Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm eval:parser       # результат — в отчёт и WORKLOG целиком
pnpm build
```

### Definition of Done (B)
- [ ] Шаги 1–14 выполнены, проверки зелёные, гейты evals пройдены и приложены.
- [ ] Коммиты: conventional commits, мелкие; `Co-Authored-By` — своей моделью исполнителя.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 014B calendar-parser` + Сделано/Коммиты/Evals/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод проверок (кратко), открытые вопросы.

---

## Фаза C — страница `/calendar`, ответ участника, действия директора, шарик «Календарь» и напоминание на Пульсе и в Ленте (одна сессия)

### Ветка и скоуп
- Ветка: `feat/014c-calendar-screen`.
- Трогать только: `app/calendar/page.tsx`, `app/calendar/layout.tsx`, `app/calendar/loading.tsx` (новые), `components/calendar/*` (новые), `lib/calendar/queries.ts`, `lib/calendar/mutations.ts`, `lib/calendar/agenda.ts` + `lib/calendar/agenda.test.ts`, `lib/calendar/say.ts` + `lib/calendar/say.test.ts` (новые), `lib/store/ingest.ts` (только если `startManualEvent` не сделан в B), `components/pulse/useSpeech.ts`, `app/(director)/pulse/page.tsx`, `app/(employee)/feed/page.tsx`, `app/(director)/settings/page.tsx`, `components/ui/PageSkeletons.tsx`.

### Шаги
1. **`lib/calendar/queries.ts`**: типы `EventRow`, `ParticipantRow` из `Database`; `CalendarEvent = EventRow & { participants: (ParticipantRow & { person: { full_name: string } })[] }`; `calendarKeys`; хук `useCalendar(enabled = true)` на `useRealtimeQuery`: `select *, participants:event_participants(*, person:profiles!event_participants_user_id_fkey(full_name))` где `cancelled_at is null` и `starts_at >= <начало сегодняшних суток Aqtobe минус 1 день>` и `starts_at < <+30 дней>`, `order starts_at`; каналы `{ table: "events" }` и `{ table: "event_participants" }` — обработчик по умолчанию (invalidate). Хук `useEvent(id)` — одна строка тем же `select`.
2. **`lib/calendar/agenda.ts`** (чистые функции + тесты): `dayGroups(events, now) → { ymd, label, events }[]` (label: «Сегодня», «Завтра», иначе `humanYmd`-подобное «пятница, 25 сен» через `lib/datetime/calendar`); `timeRange(event)` → «10:00» / «10:00–11:30»; `nextEvent(events, now)` — ближайшее с `starts_at >= now - 30 мин`; `startsSoon(event, now, withinMs = 15 мин)`; `myStatus(event, meId)`; `rsvpSummary(event) → string` («4 из 6 будут» / «4 из 6 будут, 1 не сможет»); `peopleCount(event)` (без `declined`). Тесты — по случаю на функцию, включая пустой список.
3. **`lib/calendar/say.ts`** (чистые функции + тесты, тон DESIGN §4 — факты, без восклицаний): `describeCalendar(prev, next, now, meId): Phrase[]` — (а) у мероприятия появился `reminded_at` → «Через N минут — «Планёрка», 6 человек» (N из `starts_at − now`, округлить до минут; если уже началось — «Началось: «Планёрка»»); (б) участник (не я) сменил статус на `going` → «Марат будет на «Планёрка»»; на `declined` → «Марат не сможет на «Планёрка»: занят срочным» (причина, если есть); (в) новое мероприятие, где я участник, но не автор → «Приглашение: «Планёрка», завтра 10:00» (время через `humanAqtobe`); (г) перенос (`starts_at` изменился) → «Перенос: «Планёрка» теперь завтра 11:00». `nextEventLine(events, now): string | null` — «Сегодня в 15:00 — «Планёрка», 6 человек» / null, если сегодня впереди ничего нет. Заголовки — через `quoteTitleOf` из `lib/pulse/board.ts`.
4. **`lib/calendar/mutations.ts`** (образец `lib/tasks/mutations.ts`; optimistic → патч кэша `calendarKeys` → откат → тост `GENERIC_ERROR`):
   - `useRespondEvent()` — `supabase.rpc("respond_event", { p_event, p_status, p_reason })`, optimistic-статус в `participants`;
   - `useSetParticipants()` — `rpc("set_event_participants", { p_event, p_add, p_remove })`;
   - `useUpdateEvent()` — прямой `update events set { title | starts_at | location | body | remind_before_min }` (RLS директора);
   - `useCancelEvent()` — `update events set cancelled_at = now()`; из кэша строка уходит сразу; тост «Отменил мероприятие» без «Отменить» (рассылка уже ушла).
5. **`app/calendar/layout.tsx`** — копия `app/shop/layout.tsx`; `loading.tsx` — скелет списка из `PageSkeletons`. **`app/calendar/page.tsx`** (`"use client"`, `Screen title="Календарь"`):
   - у директора справа в шапке кнопка «+» (44 px) → `useIngestStore.startManualEvent()` (дальше `IngestOverlay` уводит на /confirm сам);
   - лента `dayGroups`: заголовок дня, строки `EventRow`: слева время `timeRange` (`tabular-nums`), справа заголовок (одна строка, `truncate`), вторая строка `text-muted`: `location` · «6 человек» · для сотрудника чип своего статуса («буду» `ok` / «не смогу» `danger` / «ответить» `accent`); мероприятие, которое `startsSoon`, — чип «скоро» `warn`;
   - пустое состояние: директор — «Скажи маскоту: «планёрка завтра в 10 со всеми» — или нажми +»; сотрудник — «Пока ничего не запланировано»;
   - тап по строке → `EventSheet` (`Sheet`): заголовок, «когда» (`humanAqtobe` + `timeRange`), место, `body`, `AudioOriginal path=audio_path` (если есть), список участников с точками статуса (`going` — `var(--ok)`, `declined` — `var(--danger)` + причина, `invited` — `var(--text-muted)`), сводка `rsvpSummary`;
     - сотрудник/менеджер: две кнопки `Button` «Буду» (primary) и «Не смогу» (secondary) → при «Не смогу» — чипы причин `["Занят срочным", "Буду в отъезде", "Болею"]` + «Без причины»; после ответа кнопки показывают выбранное и позволяют передумать;
     - директор: строки `Row` «Участники · N» → `ParticipantsPicker` из фазы B (текущий состав отмечен; `onDone` → `useSetParticipants` с разницей add/remove), «Перенести» → `WhenSheet` → `useUpdateEvent({ starts_at })`, «Отменить мероприятие» → подтверждение (`Sheet` с «Да, отменить» `danger`) → `useCancelEvent`;
   - `?e=<id>` в URL (deep-link из push) открывает `EventSheet` этого мероприятия при загрузке (если оно в выборке, иначе `useEvent(id)`);
   - всё рендерится при 320 px без горизонтального скролла; цели тапа 44 px.
6. **Пульс `app/(director)/pulse/page.tsx`**:
   - `const calendar = useCalendar();` — четвёртый шарик `{ id: "calendar", label: "Календарь", count: <мероприятия сегодня с starts_at >= now - 30 мин>, tone: startsSoon(nextEvent) ? "var(--warn)" : "var(--accent)" }` (геометрия `OrbitBalls` считает угол от `balls.length` — ничего менять не нужно); панель `calendar` — компонент `components/calendar/CalendarList.tsx` с `variant="compact"` (сегодня и завтра, строки как на странице, тап → `EventSheet`), внизу ссылка «Весь календарь ›» → `/calendar`;
   - речь: `useSpeech(rows, lanes, now, directorName, meId, ether.data, calendar.data)` — расширить `Voice` полем `describeCalendar?: (prev, next, now) => Phrase[]` и `useSpeechWith` третьим источником ровно по образцу Эфира (свой `useRef` базовой выборки, первая выборка — база, дальше — фразы; последняя фраза — `say`); в `lines` после вступительной реплики (когда `mode !== "idle"` и `speech.line.opening`) добавить строку `{ id: "calendar", text: nextEventLine(calendar.data, now) }`, если она не null;
   - барометр: `const eventSoon = startsSoon(nextEvent(calendar.data ?? [], now), now)`; `mood = alarm || eventSoon ? "alert" : null` (D-70: только «насторожен»);
   - мысль по напоминанию — приходит сама: `events_due_reminders` меняет `reminded_at`, Realtime инвалидирует `useCalendar`, `describeCalendar` даёт фразу, фраза на телефоне — мысль (существующее поведение `lines`). Тап по мысли календаря треда не открывает (как у Эфира).
7. **Лента `app/(employee)/feed/page.tsx`**: тот же четвёртый шарик и панель `CalendarList variant="compact"`; в `voice` — `describeCalendar: (prev, next, at) => describeCalendar(prev, next, at, meId)`; строка «Сегодня в 15:00 — …» — тем же способом, что на Пульсе.
8. **`app/(director)/settings/page.tsx`**: в `RowGroup` после «Экран» — `<Row icon={<CalendarIcon />} title="Календарь" value="мероприятия и участники" href="/calendar" />`; `CalendarIcon` — локальный контурный SVG 20×20 в стиле `GiftIcon`/`TvIcon` (та же форма, что `KindIcon.event`).
9. **Ручная проверка на dev** (эмуляция iPhone SE; директор + Марат в двух окнах): (а) директор голосом/текстом «планёрка завтра в 10, Марат и Айгуль» → /confirm → «Отправить» → на Пульсе шарик «Календарь» с числом (если сегодня) и мероприятие на `/calendar`; у Марата в Ленте без перезагрузки — мысль «Приглашение: …», шарик «Календарь», push «Приглашение» (в окне доставки); (б) Марат открывает `/calendar?e=<id>` из push → шторка → «Не смогу» → «Занят срочным» → у директора мысль «Марат не сможет на …: занят срочным», на карточке «1 из 3 будут, 1 не сможет»; Марат → «Буду» → «Марат будет на …»; (в) директор → «Участники» → добавить Ерлана → у Ерлана приглашение; (г) директор → «Перенести» на +1 час → у участников push «Перенос», в шторке новое время; (д) напоминание: поставить мероприятие на `now + 31 мин` (через «Перенести»), подождать минутный свип (`pnpm dev` + ручной `POST /api/push/sweep` с `CRON_SECRET`, если локально cron не тикает) → у директора и участников push «Скоро», мысль «Через 30 минут — …», лицо `alert` при ≤ 15 мин; (е) «Отменить мероприятие» → строка ушла у всех, push «Отмена»; (ж) оффлайн: выключить сеть, «Буду», включить → статус доехал один раз; (з) под Ерланом (не участник) `/calendar` пуст, прямой `select` из консоли — 0 строк.
10. `pnpm smoke:ui` со скриншотами `/calendar` и Пульса с открытой панелью «Календарь» (iPhone SE и средний Android) — пути в отчёт.

### Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
# в отдельном терминале: pnpm dev
pnpm smoke:ui
```

### Definition of Done (C)
- [ ] Шаги 1–10 выполнены, проверки зелёные, скриншоты приложены.
- [ ] Ручная проверка (шаг 9) пройдена по всем восьми пунктам; что не прошло — в отчёт, не чинить за пределами скоупа.
- [ ] Коммиты: conventional commits, мелкие; `Co-Authored-By` — своей моделью исполнителя.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 014C calendar-screen` + Сделано/Коммиты/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод проверок (кратко), открытые вопросы.

---

## Фаза D — ТВ: мероприятия в бегущей строке, «Скоро — …» голосом лица, ближайшее на сцене «часы» (одна сессия)

### Ветка и скоуп
- Ветка: `feat/014d-calendar-tv`.
- Трогать только: `lib/tv/feed.ts` (+ `lib/tv/feed.test.ts`), `lib/tv/voice.ts` (+ тест), `lib/tv/ticker.ts` (+ `lib/tv/ticker.test.ts`), `lib/tv/queries.ts`, `components/tv/TvClock.tsx`, `components/tv/TvScreen.tsx` (только проброс пропса в `TvClock`).

### Шаги
1. **`lib/tv/queries.ts`**: тип `TvEventRow = { id: string; title: string | null; starts_at: string; location: string | null; people: number }`; в `TvSummary` — `events: TvEventRow[]`, в `EMPTY_SUMMARY` — `events: []`.
2. **`lib/tv/feed.ts`**: в `TV_KINDS` — `"event"`; `LABEL.event = "Скоро"`, `TONE.event = "accent"`. `lineOf` для `event`: `name` пустая (актора нет), `detail` — `payload.title` (у гостя null). Тест: строка вида `event` с гостем → `detail` null.
3. **`lib/tv/voice.ts`**: `phraseOf` — `case "event": return line.detail ? `Скоро — «${line.detail}»` : "Скоро — мероприятие";`; в `GLAD` не добавлять (тон `speaking`). Тест на обе ветки.
4. **`lib/tv/ticker.ts`**: после вердикта — по строке на каждое из `summary.events` (не более 3): `«Сегодня 15:00 · Планёрка · 6 чел.»` / `«Завтра 10:00 · …»` (день — по `tvDate`-логике `lib/tv/clock.ts` относительно `summary.now`; название у гостя — «Мероприятие»; `location` через ` · `, если есть; «чел.» — число `people`), `tone: "accent"`; если до начала ≤ 30 мин — `tone: "warn"`. Тесты: гость без названия; порядок «сегодня → завтра»; пустой список — строк нет.
5. **`components/tv/TvClock.tsx`**: новый проп `next: TvEventRow | null`; под датой строка `text-[3.2vh] text-muted`: «Ближайшее: 15:00 · Планёрка» (гость — «Мероприятие»); если `next` null — строки нет. `TvScreen` передаёт `next = data?.events[0] ?? null`.
6. **Ручная проверка на dev** (киоск под `tv`, директор в другом окне): (а) создать мероприятие на сегодня → в бегущей строке появилась строка «Сегодня HH:MM · …» ≤ 30 с (refetch сводки) или сразу после `tv_events`; (б) сцена «часы» (`tv_control(null,null,null,'clock')`) показывает «Ближайшее: …»; (в) перенести мероприятие на `now + 31 мин`, дождаться свипа → лицо говорит «Скоро — «…»», строка тикера стала `warn`; (г) «Посетитель» вкл → «Мероприятие» вместо названия и без места; (д) отменить → строка пропала. Скриншоты стены (1920×1080): тикер с мероприятием и сцена «часы» — пути в отчёт.

### Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### Definition of Done (D)
- [ ] Шаги 1–6 выполнены, проверки зелёные, два скриншота приложены.
- [ ] Ручная проверка (шаг 6) пройдена по всем пяти пунктам; что не прошло — в отчёт.
- [ ] Коммиты: conventional commits, мелкие; `Co-Authored-By` — своей моделью исполнителя.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 014D calendar-tv` + Сделано/Коммиты/Вопросы.
- [ ] Отчёт в чат: что сделано, вывод проверок (кратко), открытые вопросы.

---

## Вне скоупа наряда (не делать; идеи — в WORKLOG «бэклог»)
- Месячная сетка календаря (v1 — лента по дням на 30 дней вперёд); прошедшие мероприятия и их история.
- Повторяющиеся мероприятия («каждый понедельник планёрка») — остаются `recurrence`, раннер не строится.
- Telegram-ярус для приглашений и напоминаний; SMS.
- Правка участниками (сотрудник не меняет время и состав); комментарии к мероприятию; вложения кроме исходного аудио.
- Утренняя сводка «сегодня у тебя …» (после гейта адаптации, вместе с докладом Капли).
- Слияние `reminders` в мероприятия/заметки (открытый D-75 (б)).
- Правки `docs/DATABASE.md`, `docs/BACKEND.md` §4/§10, `docs/AI.md` §2–4, `docs/FRONTEND.md`, `docs/CONCEPT.md` §3 — сделает архитектор при приёмке.
