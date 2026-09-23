# tasks/017-publish-scheduled.md — отложенные задачи уходят по минутному тику; cron принимает GET

> **Режим исполнителя.** Ты выполняешь этот наряд строго по шагам, ради экономии токенов: НЕ читай доки сверх списка ниже, НЕ запускай /code-review, НЕ улучшай и НЕ рефакторь вне скоупа, НЕ исследуй альтернативы. Самопроверка — ТОЛЬКО команды из «Проверки» (они обязательны, их пропускать нельзя). Семантическое ревью сделает отдельная сессия. Наткнулся на противоречие или отсутствующее решение — СТОП, запиши вопрос в отчёт и в WORKLOG.md, не выдумывай.

> Источник: аудит доков и кода 2026-09-23 (сессия Opus по просьбе владельца «проанализируй решения, что убрать и что переписать»; владелец: «делай как считаешь нужным, главное — не повредить работе»). Код ниже уже написан и прошёл `tsc` и `eslint`, но **не закоммичен и не применён к dev**: коммит и `db push` из той сессии были запрещены правилами прав. Готовые файлы лежат в рабочей копии `C:\Users\Turing\AppData\Local\Temp\claude\z--Pulse\9c48ff27-b30a-4cb1-adfd-91609268fdbf\scratchpad\wt-sched` (ветка `fix/scheduled-publish`, коммитов нет); если папки уже нет — всё содержимое приведено в шагах.

## Что сломано (факт, проверено по коду)

1. **Задача «отправлю утром» не уходит никогда.** Вне окна доставки (D-38) `confirm_voice_batch` пишет задачу со статусом `scheduled` и `scheduled_send_at` = открытие окна; `reassign_task` вне окна — так же (D-51 п.3). Перевести `scheduled → sent` может только «cron» (охранник статусов пускает этот переход лишь без пользователя, `auth.uid() is null`). Но pg_cron-джобы `publish_scheduled` из docs/DATABASE.md не существует (pg_cron не подключён), а единственный тик — Vercel cron `/api/push/sweep` — этот переход не делает. Сотрудник такую задачу не видит (RLS прячет `scheduled`), директор думает, что она ушла утром.
2. **Vercel Cron вызывает путь из `vercel.json` методом GET**, а `/api/push/sweep` экспортирует только `POST` → 405, минутный тик (повтор пушей, напоминания о мероприятиях D-78, эскалация заявок D-79) на Vercel, скорее всего, не выполняется вовсе.

Всё остальное для перехода уже есть и трогать не нужно: `task_status_guard` (переход `scheduled → sent` без пользователя), `notify_outbox_task` (на этом переходе кладёт `task_sent` исполнителю), `tv_events_task` (событие `task_sent` для стены), `deliver_after` не держит `task_sent`.

## Контекст (читать только это)
- `CLAUDE.md`: принципы 7, 8; регламент п.4, п.6.
- `app/api/push/sweep/route.ts`, `vercel.json`, `lib/supabase/types.ts` (секция `Functions`).
- Образец тика: `supabase/migrations/20260918150000_calendar_events.sql` — функция `events_due_reminders` и её гранты (стр. ~697–702); тест `supabase/tests/020_calendar.test.sql` §8.
- Решения: D-38, D-51 п.3, G.20c (воркер — API-роут), D-78 §5, D-79 §6.

## Ветка и скоуп
- Ветка: `fix/017-publish-scheduled` от `main` (или закоммитить готовую ветку `fix/scheduled-publish` из рабочей копии выше, сверив файлы с шагами).
- Трогать только: `supabase/migrations/20260923180000_publish_scheduled.sql` (новый; если к моменту исполнения в main есть миграция с меткой позже — взять метку позже последней), `supabase/tests/022_publish_scheduled.test.sql` (новый; если номер занят — следующий свободный), `app/api/push/sweep/route.ts`, `lib/supabase/types.ts` (одна строка).
- Рабочая копия общая: `git add` только по этим путям, коммит — с проверкой ветки (`test "$(git branch --show-current)" = fix/017-publish-scheduled && git commit …`).

## Шаги

1. **Миграция** `supabase/migrations/20260923180000_publish_scheduled.sql`:

```sql
-- D-38: a task dictated outside the delivery window (or reassigned outside it, D-51 §3)
-- is stored as `scheduled` with `scheduled_send_at` = the next window opening. Nothing
-- ever released it: the pg_cron job `publish_scheduled` from docs/DATABASE.md was never
-- created (pg_cron is not enabled), and the only tick is the Vercel minute cron hitting
-- /api/push/sweep. So «отправлю утром» tasks stayed invisible to the assignee forever.
--
-- The minute sweep now calls this function first. Everything downstream already exists:
-- the status guard lets `scheduled -> sent` through only without a user (auth.uid() is
-- null), the outbox trigger queues `task_sent` on that transition, and tv_events emits
-- `task_sent` for the wall. A repeated or overlapping tick is harmless: a row is taken
-- only while it is still `scheduled`, and locked rows are skipped.

create or replace function publish_due_scheduled(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int;
begin
  update tasks t
     set status = 'sent'
   where t.id in (
           select s.id from tasks s
            where s.status = 'scheduled'
              and s.scheduled_send_at <= p_now
            order by s.scheduled_send_at
            for update skip locked
         );
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

revoke execute on function publish_due_scheduled(timestamptz) from public, anon, authenticated;
-- only the sweep calls the tick: no person has this button
grant execute on function publish_due_scheduled(timestamptz) to service_role;
```

2. **Типы** — в `lib/supabase/types.ts`, секция `Functions`, по алфавиту перед `purge_closed_tasks`:

```ts
      publish_due_scheduled: { Args: { p_now?: string }; Returns: number }
```

3. **Тик** — в `app/api/push/sweep/route.ts`:
   - сразу после `const service = createServiceSupabase();` (перенести эту строку выше комментария про D-78) вызвать публикацию **первой**, чтобы пуш `task_sent` ушёл тем же тиком:
     ```ts
     // first release the tasks held for the delivery window (D-38): their «task_sent»
     // rows then go out with this very sweep, not a minute later
     const published = await service.rpc("publish_due_scheduled");
     if (published.error) console.error("publish_due_scheduled failed:", published.error.message);
     ```
   - в ответ `apiOk({...})` добавить `published: published.data ?? 0,` перед `reminders`;
   - в конец файла:
     ```ts
     /** Vercel Cron calls the path from vercel.json with GET (and the same Bearer secret). */
     export const GET = POST;
     ```
   Проверка секрета остаётся одна (`CRON_SECRET` в заголовке `Authorization: Bearer …` — Vercel Cron шлёт его сам, если переменная задана в проекте).

4. **pgTAP** `supabase/tests/022_publish_scheduled.test.sql` (12 проверок; фикстуры seed: директор …0001, Марат …0007):

```sql
-- Held tasks go out (D-38): a task dictated outside the delivery window waits in
-- `scheduled`, invisible to the assignee, and the minute tick releases it once its
-- `scheduled_send_at` has come — one push, one wall event, never twice.
-- Fixtures — supabase/seed.sql: director …0001, Марат …0007.
begin;
select plan(12);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- one task is due (the window opened a minute ago), the other waits for the morning
insert into tasks (id, company_id, author_id, assignee_id, title, status, scheduled_send_at) values
  ('92000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
   'Отвезти образцы', 'scheduled', now() - interval '1 minute'),
  ('92000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
   'Позвонить в банк', 'scheduled', now() + interval '1 hour');

-- ---------------------------------------------------------------------------
-- 1. Before the tick: the assignee sees nothing, nobody is pinged
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is(
  (select count(*) from tasks where id = '92000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the assignee does not see a held task'
);
select throws_ok(
  $$ select publish_due_scheduled(now()) $$,
  '42501', null, 'an employee cannot run the tick'
);

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(
  (select count(*) from notification_deliveries
    where task_id = '92000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'),
  0::bigint,
  'a held task queues no push'
);

-- ---------------------------------------------------------------------------
-- 2. The tick releases exactly the due task
-- ---------------------------------------------------------------------------
select is(publish_due_scheduled(now()), 1, 'the tick releases the due task');
select is(
  (select status::text from tasks where id = '92000000-0000-0000-0000-000000000001'),
  'sent',
  'the due task is sent'
);
select is(
  (select status::text from tasks where id = '92000000-0000-0000-0000-000000000002'),
  'scheduled',
  'the morning task keeps waiting'
);
select is(
  (select count(*) from notification_deliveries
    where task_id = '92000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'
      and user_id = '10000000-0000-0000-0000-000000000007'),
  1::bigint,
  'the release queues one push for the assignee'
);
select is(
  (select count(*) from tv_events
    where task_id = '92000000-0000-0000-0000-000000000001' and kind = 'task_sent'),
  1::bigint,
  'and one wall event'
);

-- ---------------------------------------------------------------------------
-- 3. A repeated tick of the same minute does nothing
-- ---------------------------------------------------------------------------
select is(publish_due_scheduled(now()), 0, 'the second tick finds nothing');
select is(
  (select count(*) from notification_deliveries
    where task_id = '92000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'),
  1::bigint,
  'and queues no second push'
);

-- ---------------------------------------------------------------------------
-- 4. The assignee sees the released task; the morning one goes when its time comes
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is(
  (select count(*) from tasks where id = '92000000-0000-0000-0000-000000000001'),
  1::bigint,
  'the assignee sees the released task'
);

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(publish_due_scheduled(now() + interval '2 hours'), 1, 'the morning task goes at its time');

select * from finish();
rollback;
```

5. **Применить на dev.** dev общий с владельцем: перед `db push` проверить `supabase migration list` — на dev должны быть все миграции main, кроме новой (на 2026-09-23 11:02 UTC так и было; отложенных задач на dev было 0, так что функция ничего старого не разошлёт). Затем `pnpm db:push`.

6. **Проверка на dev service-role-скриптом** (Docker для pgTAP обычно нет — см. WORKLOG): создать от имени директора компании (service role, `author_id` = директор, `assignee_id` = любой активный сотрудник) задачу с уникальным заголовком `smoke-017 <время>`, `status='scheduled'`, `scheduled_send_at = now() - 1 min`; вызвать `admin.rpc("publish_due_scheduled")` → `1`; проверить `status = 'sent'`, одну строку `notification_deliveries` `task_sent` этому сотруднику и одну `tv_events` `task_sent`; повторный вызов → `0`; убрать за собой: удалить service role'ом строки `notification_deliveries` и `tv_events` с этим `task_id` (если не ушли каскадом) и саму задачу (`delete_task` не подходит — он требует директора). Если сотрудник-адресат — телефон владельца с подпиской, пуш не уйдёт, пока никто не вызовет свип; сам свип в этой проверке НЕ вызывать.

7. **Cron на Vercel** (если dev развёрнут на Vercel): проверить в Vercel → Settings → Environment Variables, что `CRON_SECRET` задан, и в логах функций — что `/api/push/sweep` отвечает 200 раз в минуту. На тарифе Hobby Vercel Cron, насколько известно, запускается не чаще раза в сутки — если так, записать в отчёт: минутный тик требует Pro или внешнего планировщика (решение владельца, не исполнителя).

## Проверки (обязательные, машинные)
```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:rls        # если Docker Desktop запущен; иначе — записать «не запускался» в WORKLOG
```
В рабочей копии с node_modules-связкой на `Z:\Pulse` pnpm НЕ вызывать вообще — только `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js`, `node node_modules/vitest/vitest.mjs run`.

## Definition of Done
- [ ] Шаги 1–6 выполнены, проверки зелёные; шаг 7 — результат в отчёте.
- [ ] Коммит(ы): `fix(delivery): …`, conventional commits; подпись `Co-Authored-By` — своей моделью.
- [ ] Append-запись в WORKLOG.md: `## <дата> — Исполнитель (Opus) — 017 publish-scheduled` + Сделано/Коммиты/Вопросы; явно — запускался ли pgTAP.
- [ ] Отчёт в чат: что сделано, вывод проверок, результат шага 6 (числа), шаг 7.

## Вне скоупа (найдено тем же аудитом, отдельными нарядами)
- **Напоминания и повторы не исполняются.** `confirm_voice_batch` пишет `reminders` («напомни мне…») и `recurrence_rules` («каждый понедельник…»), но их никто не читает: директор подтверждает карточку, а напоминание не придёт никогда. Связано с открытым D-75 (б) (слить `reminders` в `notes`) — нужно решение владельца, потом наряд.
- Срок хранения аудио (D-18) не построен — аудио копится бессрочно (D-66 п.6).
- `docs/DATABASE.md` (таблица pg_cron) и `docs/BACKEND.md` §10 описывают несуществующие джобы — правится в наряде 018 (фаза E), уже с этой функцией.
