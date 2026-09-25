-- Стена v3 (D-120): дела карточками с хронологией и рейтинг человека.
-- Хронология — вид и время, без слов; отказ, «Настоять» и комментарий к доработке на стену
-- не выходят (D-45); ответ директора живёт в строке вопроса. Рейтинг — для любого места
-- (не только топ-5, как было через fn_rating), но место — только из первой пятёрки; гостю
-- рейтинга нет (D-33). Хелпер истории напрямую не вызывается никем.
-- Фикстуры — supabase/seed.sql: директор …0001, киоск …0004, Марат …0007; люди рейтинга
-- …0002, …0003, …0005, …0006, …0008. На dev роли дрейфуют — прибиваем их здесь.
begin;
select plan(25);

-- ---------------------------------------------------------------------------
-- 0. Сцена: очки включены, люди рейтинга на местах, два дела Марата
-- ---------------------------------------------------------------------------
set local role postgres;
set local request.jwt.claims = '{}';

update companies set settings = settings || '{"points_enabled": true}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';
update profiles set role = 'employee', is_active = true
 where id in ('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000005',
              '10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000008');
update profiles set is_active = true
 where id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');

-- A: вся жизнь дела; срок в далёком прошлом — чтобы оба дела стояли первыми из двенадцати
insert into tasks (company_id, author_id, assignee_id, title, status, deadline, source)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000007', 'Стена v3: история', 'sent',
        now() - interval '1000 days', 'voice');
-- B: отказ и «Настоять» — на стене только «поставлена»
insert into tasks (company_id, author_id, assignee_id, title, status, deadline)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000007', 'Стена v3: отказ', 'sent',
        now() - interval '999 days');

create temp table story_tasks as
  select id, title from tasks where title in ('Стена v3: история', 'Стена v3: отказ');
grant select on story_tasks to authenticated;

-- A: увидел, принял, спросил, директор ответил, фото, сдал с фото, вернули с комментарием
update notification_deliveries set seen_at = now()
 where task_id = (select id from story_tasks where title = 'Стена v3: история')
   and event_kind = 'task_sent';
update tasks set status = 'accepted' where title = 'Стена v3: история';
insert into task_messages (company_id, task_id, sender_id, type, content, meta)
select '11111111-1111-1111-1111-111111111111', id, '10000000-0000-0000-0000-000000000007',
       'text', 'Какой объём?', '{"is_question": true}'::jsonb
  from story_tasks where title = 'Стена v3: история';
insert into task_messages (company_id, task_id, sender_id, type, content)
select '11111111-1111-1111-1111-111111111111', id, '10000000-0000-0000-0000-000000000001',
       'text', 'Весь этаж'
  from story_tasks where title = 'Стена v3: история';
insert into task_messages (company_id, task_id, sender_id, type, file_path)
select '11111111-1111-1111-1111-111111111111', id, '10000000-0000-0000-0000-000000000007',
       'photo', 'x/photo.jpg'
  from story_tasks where title = 'Стена v3: история';
update tasks set status = 'pending_review' where title = 'Стена v3: история';
insert into task_messages (company_id, task_id, sender_id, type, file_path, meta)
select '11111111-1111-1111-1111-111111111111', id, '10000000-0000-0000-0000-000000000007',
       'photo', 'x/report.jpg', '{"report": true}'::jsonb
  from story_tasks where title = 'Стена v3: история';
update tasks set status = 'rework' where title = 'Стена v3: история';
insert into task_messages (company_id, task_id, sender_id, type, content, meta)
select '11111111-1111-1111-1111-111111111111', id, '10000000-0000-0000-0000-000000000001',
       'text', 'Переделать фасад', '{"rework_comment": true}'::jsonb
  from story_tasks where title = 'Стена v3: история';

-- B: «Не могу» с причиной, директор настоял
update tasks set status = 'declined' where title = 'Стена v3: отказ';
insert into task_messages (company_id, task_id, sender_id, type, content, meta)
select '11111111-1111-1111-1111-111111111111', id, '10000000-0000-0000-0000-000000000007',
       'text', 'Нет машины', '{"decline_reason": true}'::jsonb
  from story_tasks where title = 'Стена v3: отказ';
update tasks set status = 'sent' where title = 'Стена v3: отказ';

-- очки: 10 три недели назад, 1 000 000 на этой неделе — Марат первый
insert into point_transactions (company_id, user_id, amount, reason, source, created_at)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007',
        10, 'тест стены', 'manual', now() - interval '20 days'),
       ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007',
        1000000, 'тест стены', 'manual', now());

-- ---------------------------------------------------------------------------
-- 1. Директор ставит Марата на стену, гостя нет
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select tv_control(p_guest => false) $$, 'no guest in the office');
select lives_ok($$ select tv_control('employee', '10000000-0000-0000-0000-000000000007'::uuid) $$,
                'Марат on the wall');

-- киоск читает
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
create temp table wall as select tv_focus() as f;

create temp table story_a as
  select e
    from wall, jsonb_array_elements(wall.f->'tasks') task, jsonb_array_elements(task->'story') e
   where task->>'title' = 'Стена v3: история';

-- ---------------------------------------------------------------------------
-- 2. Хронология дела A
-- ---------------------------------------------------------------------------
select is((select task->>'source' from wall, jsonb_array_elements(wall.f->'tasks') task
            where task->>'title' = 'Стена v3: история'), 'voice', 'the card knows the order was spoken');
select ok(exists (select 1 from story_a where e->>'k' = 'posted'), 'the story starts with the order');
select ok(exists (select 1 from story_a where e->>'k' = 'seen'), 'the receipt says the person saw it');
select ok(exists (select 1 from story_a where e->>'k' = 'accepted'), 'and accepted it');
select ok(exists (select 1 from story_a where e->>'k' = 'question' and e ? 'ans'),
          'the question carries the time of its answer');
select ok(not exists (select 1 from story_a where e->>'k' = 'director'),
          'the answer itself is not a second row');
select is((select count(*)::int from story_a where e->>'k' = 'photo'), 1,
          'one photo in the thread; the report photo rides with the handover');
select is((select e->>'rep' from story_a where e->>'k' = 'review'), 'photo', 'handed over with a photo');
select ok(exists (select 1 from story_a where e->>'k' = 'again'), 'the return is «again», nothing more');
select ok(not exists (select 1 from story_a where e->>'k' = 'text'),
          'the rework comment never reaches the wall (D-45)');
select ok(not exists (select 1 from story_a where e::text ~ 'Какой|Весь|фасад'),
          'no words of the thread on the wall');

-- ---------------------------------------------------------------------------
-- 3. Дело B: отказ и «Настоять» не видны
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(e->>'k')
     from wall, jsonb_array_elements(wall.f->'tasks') task, jsonb_array_elements(task->'story') e
    where task->>'title' = 'Стена v3: отказ'),
  array['posted'],
  'a declined and insisted order shows only that it was given (D-45)'
);

-- ---------------------------------------------------------------------------
-- 4. Рейтинг: место из пятёрки, недели, итоги недели
-- ---------------------------------------------------------------------------
select is((select (f->'rating'->>'rank')::int from wall), 1, 'Марат is first');
select is((select jsonb_array_length(f->'rating'->'weeks') from wall), 4, 'four weeks of points');
select ok((select (f->'rating'->'weeks'->>1)::int >= 10 from wall), 'three weeks ago lands in the second bar');
select is((select (f->'points_week')::int from wall), (select (f->'rating'->'weeks'->>3)::int from wall),
          'points_week (v2) is the last bar');
select ok((select f->'rating' ? 'done_week' and f->'rating' ? 'on_time_week' from wall),
          'the week done is counted');
select ok((select jsonb_typeof(f->'done_recent') = 'array' from wall), 'the week done comes with stories');

-- пятеро обгоняют Марата: места на стене больше нет, очки остаются
set local role postgres;
insert into point_transactions (company_id, user_id, amount, reason, source)
select '11111111-1111-1111-1111-111111111111', p.id, 10000000, 'тест стены', 'manual'
  from profiles p
 where p.id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
                '10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000006',
                '10000000-0000-0000-0000-000000000008');
set local role authenticated;
select ok((select tv_focus()->'rating'->>'rank' is null), 'below the fifth place the wall shows no place');
select ok((select (tv_focus()->>'points_week')::int >= 1000000),
          'but the points are there for any place (the kiosk lost them in v2)');

-- ---------------------------------------------------------------------------
-- 5. Гость: ни рейтинга, ни названий; история — только виды и время
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select tv_control(p_guest => true) $$, 'a guest walks in');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select ok((select tv_focus()->'rating' = 'null'::jsonb or not (tv_focus() ? 'rating')),
          'no rating for a guest (D-33)');

-- ---------------------------------------------------------------------------
-- 6. Хелпер истории напрямую не зовут
-- ---------------------------------------------------------------------------
select throws_ok(
  format('select tv_task_story(%L::uuid)', (select id from story_tasks where title = 'Стена v3: история')),
  '42501', null::text, 'the kiosk cannot call the story helper itself'
);

set local role postgres;
select * from finish();
rollback;
