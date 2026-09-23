-- D-99: связь директора и секретаря — ответ несёт информацию, просьба не уходит в пустоту,
-- «не беспокоить» кончается само, тревога «вызови охрану» доходит.
--
-- Автомат заявки (D-79 §1) не меняется: sent → accepted → done | declined | cancelled.
-- Всё новое — поля и короткие RPC вокруг него, каждая с client_request_id (принцип 7):
--   result      что секретарь передаёт директору вместе с «Готово» («Врач будет в 15:00»)
--   eta_at      «Принял · через 5 мин» — к чему обещано
--   question …  уточнение секретаря и ответ директора одним тапом
--   until_at    просьба кончается сама («не беспокоить на 30 мин», до конца встречи)
--   urgent      тревога («Охрана»): без окна отмены, повтор пуша каждую минуту, пока не взяли
--   nudged_at   «Напомнить ещё раз» директора — не чаще раза в минуту
--   profiles.away_until  «не на месте до 14:00»: просьба уходит тем, кто на месте
-- Пуши директору стали тише: «принято» и «готово» он видит на столе секретаря и в мысли
-- маскота; пуш приходит на «не выйдет», на уточнение, на «готово» с результатом и на всё
-- по тревоге.

alter table errands
  add column result      text check (result is null or char_length(result) <= 200),
  add column eta_at      timestamptz,
  add column question    text check (question is null or char_length(question) <= 200),
  add column asked_at    timestamptz,
  add column answer      text check (answer is null or char_length(answer) <= 200),
  add column answered_at timestamptz,
  add column until_at    timestamptz,
  add column urgent      boolean not null default false,
  add column nudged_at   timestamptz;

comment on column errands.result is 'D-99: what the secretary passed back with «Готово»';
comment on column errands.eta_at is 'D-99: when the secretary promised it on «Принял»';
comment on column errands.until_at is 'D-99: the request ends by itself at this moment (errands_expire)';
comment on column errands.urgent is 'D-99: an alarm («Охрана»): no undo window, a repeat push every minute until taken';

alter table profiles add column away_until timestamptz;
comment on column profiles.away_until is 'D-99: stepped away until then — requests go to the secretaries who are here';

-- ---------------------------------------------------------------------------
-- 1. Кому уходит просьба: активные секретари компании, кроме автора; если кто-то из них
--    на месте — только те, кто на месте; если никого — всем (просьба дождётся).
-- ---------------------------------------------------------------------------
create or replace function errand_recipients(p_company uuid, p_author uuid) returns setof uuid
language sql stable security definer set search_path = public
as $fn$
  with team as (
    select p.id, (p.away_until is null or p.away_until <= now()) as here
      from profiles p
     where p.company_id = p_company
       and p.role = 'secretary'
       and p.is_active
       and p.id <> p_author
  )
  select t.id from team t
   where t.here or not exists (select 1 from team w where w.here)
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Идемпотентность коротких RPC — тот же ingest_batches, что у transition_errand.
-- ---------------------------------------------------------------------------
create or replace function errand_replay(p_crid uuid) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_result jsonb;
begin
  if p_crid is null then
    return null;
  end if;
  insert into ingest_batches (company_id, user_id, client_request_id, result)
  values (auth_company_id(), auth.uid(), p_crid, '{}'::jsonb)
  on conflict on constraint ingest_batches_company_request_key do nothing;
  if found then
    return null;
  end if;
  select b.result into v_result
    from ingest_batches b
   where b.company_id = auth_company_id() and b.client_request_id = p_crid;
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
end;
$fn$;

create or replace function errand_remember(p_crid uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
begin
  if p_crid is not null then
    update ingest_batches b set result = p_result
     where b.company_id = auth_company_id() and b.client_request_id = p_crid;
  end if;
  return p_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. «Принял · через 5 мин»: обещание взявшего секретаря; пуша нет — отсчёт на столе.
-- ---------------------------------------------------------------------------
create or replace function errand_eta(p_id uuid, p_min int, client_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid uuid := client_request_id;
  v_seen jsonb;
  v_row  errands%rowtype;
begin
  v_seen := errand_replay(v_crid);
  if v_seen is not null then
    return v_seen;
  end if;
  if p_min is null or p_min < 0 or p_min > 240 then
    raise exception 'bad_eta' using errcode = 'P0001';
  end if;
  select * into v_row from errands e where e.id = p_id and e.company_id = auth_company_id() for update;
  if v_row.id is null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_row.status <> 'accepted' or v_row.claimed_by is distinct from auth.uid() then
    raise exception 'bad_transition' using errcode = 'P0001';
  end if;
  update errands e set eta_at = now() + make_interval(mins => p_min) where e.id = p_id returning * into v_row;
  return errand_remember(v_crid, to_jsonb(v_row));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Уточнение: спрашивает секретарь (любой — пока ничья, взявший — потом), отвечает автор.
--    Каждое уходит пушем другой стороне.
-- ---------------------------------------------------------------------------
create or replace function errand_ask(p_id uuid, p_question text, client_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid uuid := client_request_id;
  v_seen jsonb;
  v_row  errands%rowtype;
  v_name text;
  v_text text := nullif(btrim(coalesce(p_question, '')), '');
begin
  v_seen := errand_replay(v_crid);
  if v_seen is not null then
    return v_seen;
  end if;
  if v_text is null or char_length(v_text) > 200 then
    raise exception 'bad_question' using errcode = 'P0001';
  end if;
  if auth_role() is distinct from 'secretary' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select * into v_row from errands e where e.id = p_id and e.company_id = auth_company_id() for update;
  if v_row.id is null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if not (v_row.status = 'sent' or (v_row.status = 'accepted' and v_row.claimed_by = auth.uid())) then
    raise exception 'bad_transition' using errcode = 'P0001';
  end if;

  update errands e
     set question = v_text, asked_at = now(), answer = null, answered_at = null
   where e.id = p_id
  returning * into v_row;

  select split_part(pr.full_name, ' ', 1) into v_name from profiles pr where pr.id = auth.uid();
  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  values (v_row.company_id, v_row.author_id, 'errand_question',
          jsonb_build_object(
            'title', coalesce(v_name, 'Секретарь') || ' спрашивает',
            'body', v_row.label || ': ' || v_text,
            'errand_id', v_row.id,
            'tag', 'errand-' || v_row.id,
            'url', '/pulse'));
  return errand_remember(v_crid, to_jsonb(v_row));
end;
$fn$;

create or replace function errand_answer(p_id uuid, p_answer text, client_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid uuid := client_request_id;
  v_seen jsonb;
  v_row  errands%rowtype;
  v_text text := nullif(btrim(coalesce(p_answer, '')), '');
begin
  v_seen := errand_replay(v_crid);
  if v_seen is not null then
    return v_seen;
  end if;
  if v_text is null or char_length(v_text) > 200 then
    raise exception 'bad_answer' using errcode = 'P0001';
  end if;
  select * into v_row from errands e where e.id = p_id and e.company_id = auth_company_id() for update;
  if v_row.id is null or v_row.author_id is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_row.question is null or v_row.status not in ('sent', 'accepted') then
    raise exception 'bad_transition' using errcode = 'P0001';
  end if;

  update errands e set answer = v_text, answered_at = now() where e.id = p_id returning * into v_row;

  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  select v_row.company_id, r.id, 'errand_answer',
         jsonb_build_object(
           'title', 'Директор ответил',
           'body', v_row.question || ' — ' || v_text,
           'errand_id', v_row.id,
           'tag', 'errand-' || v_row.id,
           'url', '/feed')
    from (
      select v_row.claimed_by as id where v_row.claimed_by is not null
      union all
      select x from errand_recipients(v_row.company_id, v_row.author_id) x where v_row.claimed_by is null
    ) r;
  return errand_remember(v_crid, to_jsonb(v_row));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. «Готово» с результатом: взявший дописывает в течение получаса после «Готово»; пуш
--    директору — единственный «готово», который до него доходит (кроме тревоги).
-- ---------------------------------------------------------------------------
create or replace function errand_result(p_id uuid, p_result text, client_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid uuid := client_request_id;
  v_seen jsonb;
  v_row  errands%rowtype;
  v_name text;
  v_text text := nullif(btrim(coalesce(p_result, '')), '');
begin
  v_seen := errand_replay(v_crid);
  if v_seen is not null then
    return v_seen;
  end if;
  if v_text is null or char_length(v_text) > 200 then
    raise exception 'bad_result' using errcode = 'P0001';
  end if;
  select * into v_row from errands e where e.id = p_id and e.company_id = auth_company_id() for update;
  if v_row.id is null or v_row.claimed_by is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_row.status <> 'done' or v_row.done_at < now() - interval '30 minutes' then
    raise exception 'bad_transition' using errcode = 'P0001';
  end if;

  update errands e set result = v_text where e.id = p_id returning * into v_row;

  select split_part(pr.full_name, ' ', 1) into v_name from profiles pr where pr.id = auth.uid();
  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  values (v_row.company_id, v_row.author_id, 'errand_done',
          jsonb_build_object(
            'title', 'Готово · ' || coalesce(v_name, 'секретарь'),
            'body', v_row.label || ': ' || v_text,
            'errand_id', v_row.id,
            'tag', 'errand-' || v_row.id,
            'url', '/pulse'));
  return errand_remember(v_crid, to_jsonb(v_row));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. «Напомнить ещё раз»: автор, пока просьбу никто не взял, не чаще раза в минуту.
-- ---------------------------------------------------------------------------
create or replace function errand_nudge(p_id uuid, client_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid uuid := client_request_id;
  v_seen jsonb;
  v_row  errands%rowtype;
begin
  v_seen := errand_replay(v_crid);
  if v_seen is not null then
    return v_seen;
  end if;
  select * into v_row from errands e where e.id = p_id and e.company_id = auth_company_id() for update;
  if v_row.id is null or v_row.author_id is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_row.status <> 'sent' then
    raise exception 'bad_transition' using errcode = 'P0001';
  end if;
  if v_row.nudged_at is not null and v_row.nudged_at > now() - interval '1 minute' then
    raise exception 'too_soon' using errcode = 'P0001';
  end if;

  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  select v_row.company_id, r, 'errand_sent',
         jsonb_build_object(
           'title', 'Ещё раз: ' || v_row.label,
           'body', coalesce(v_row.note, 'Директор ждёт'),
           'errand_id', v_row.id,
           'url', '/secretary?e=' || v_row.id,
           'urgent', v_row.urgent,
           'repeat', true)
    from errand_recipients(v_row.company_id, v_row.author_id) r;

  update errands e set nudged_at = now() where e.id = p_id returning * into v_row;
  return errand_remember(v_crid, to_jsonb(v_row));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. Outbox заявки заново: получатели — кто на месте, тревога — своим заголовком, директору
--    тише (см. шапку). Тело — 20260922120100 §5 с этими правками.
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_errand() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_name text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'sent' then
      insert into notification_deliveries (company_id, user_id, event_kind, meta)
      select new.company_id, r, 'errand_sent',
             jsonb_build_object(
               'title', case
                          when new.urgent and new.kind = 'security' then '🚨 Вызови охрану!'
                          when new.urgent then '🚨 Срочно: ' || new.label
                          else new.label
                        end,
               'body', coalesce(new.note, case when new.urgent then 'Директор ждёт' else '' end),
               'errand_id', new.id,
               'url', '/secretary?e=' || new.id,
               'urgent', new.urgent)
        from errand_recipients(new.company_id, new.author_id) r;
    end if;
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'accepted' then
    -- «принято» директор видит на столе секретаря; пуш — только по тревоге
    if new.urgent then
      select split_part(pr.full_name, ' ', 1) into v_name from profiles pr where pr.id = new.claimed_by;
      insert into notification_deliveries (company_id, user_id, event_kind, meta)
      values (new.company_id, new.author_id, 'errand_accepted',
              jsonb_build_object(
                'title', 'Принято · ' || coalesce(v_name, 'секретарь'),
                'body', new.label,
                'errand_id', new.id,
                'tag', 'errand-' || new.id,
                'url', '/pulse'));
    end if;

  elsif new.status = 'done' then
    -- обычное «готово» — на столе; с результатом пуш шлёт errand_result
    if new.urgent then
      select split_part(pr.full_name, ' ', 1) into v_name from profiles pr where pr.id = new.claimed_by;
      insert into notification_deliveries (company_id, user_id, event_kind, meta)
      values (new.company_id, new.author_id, 'errand_done',
              jsonb_build_object(
                'title', 'Готово · ' || coalesce(v_name, 'секретарь'),
                'body', case when new.kind = 'security' then 'Охрана на месте' else new.label || coalesce(': ' || new.result, '') end,
                'errand_id', new.id,
                'tag', 'errand-' || new.id,
                'url', '/pulse'));
    end if;

  elsif new.status = 'declined' then
    -- отказать может и тот, кто заявку не брал: тогда имя — у того, кто позвал RPC
    select split_part(pr.full_name, ' ', 1) into v_name
      from profiles pr where pr.id = coalesce(new.claimed_by, auth.uid());
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    values (new.company_id, new.author_id, 'errand_declined',
            jsonb_build_object(
              'title', 'Не может · ' || coalesce(v_name, 'секретарь'),
              'body', new.label || coalesce(' · ' || new.decline_reason, ''),
              'errand_id', new.id,
              'url', '/secretary?e=' || new.id));

  elsif new.status = 'cancelled' then
    -- пуша нет: отменённую просьбу молча снимаем с очереди, карточка гаснет по Realtime
    delete from notification_deliveries
     where status = 'queued' and meta->>'errand_id' = new.id::text;
  end if;

  return null;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 8. Эскалация заново: обычная просьба — один повтор через escalate_after_min (как было),
--    тревога — повтор каждую минуту, пока не взяли (полчаса, не дольше). Получатели — кто на месте.
-- ---------------------------------------------------------------------------
create or replace function errands_due_escalation(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_errand errands%rowtype;
  v_count  int := 0;
begin
  for v_errand in
    select e.* from errands e
      join companies c on c.id = e.company_id
     where e.status = 'sent'
       and (
         (not e.urgent
            and e.escalated_at is null
            and e.created_at + make_interval(
                  mins => coalesce((c.settings->'secretary'->>'escalate_after_min')::int, 3)) <= p_now
            -- после долгого простоя вчерашние просьбы не спамят
            and e.created_at > p_now - interval '1 hour')
         or
         (e.urgent
            and coalesce(e.escalated_at, e.created_at) <= p_now - interval '50 seconds'
            and e.created_at > p_now - interval '30 minutes')
       )
     order by e.created_at
     for update of e skip locked
  loop
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select v_errand.company_id, r, 'errand_sent',
           jsonb_build_object(
             'title', case
                        when v_errand.urgent and v_errand.kind = 'security' then '🚨 Ещё раз: вызови охрану!'
                        else 'Ещё раз: ' || v_errand.label
                      end,
             'body', coalesce(v_errand.note, case when v_errand.urgent then 'Директор ждёт' else '' end),
             'errand_id', v_errand.id,
             'url', '/secretary?e=' || v_errand.id,
             'urgent', v_errand.urgent,
             'repeat', true)
      from errand_recipients(v_errand.company_id, v_errand.author_id) r;

    update errands e set escalated_at = p_now where e.id = v_errand.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 9. Просьба со сроком кончается сама (минутный свип): взятая — «готово», ничья — отменена.
-- ---------------------------------------------------------------------------
create or replace function errands_expire(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int;
begin
  update errands e
     set status = case when e.status = 'accepted' then 'done'::errand_status else 'cancelled'::errand_status end,
         done_at = case when e.status = 'accepted' then p_now else e.done_at end
   where e.until_at is not null
     and e.until_at <= p_now
     and e.status in ('sent', 'accepted');
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 10. Права: короткие RPC — людям, служебное — только сервису.
-- ---------------------------------------------------------------------------
revoke execute on function errand_recipients(uuid, uuid) from public, anon, authenticated;
revoke execute on function errand_replay(uuid) from public, anon, authenticated;
revoke execute on function errand_remember(uuid, jsonb) from public, anon, authenticated;
revoke execute on function errands_expire(timestamptz) from public, anon, authenticated;
revoke execute on function errand_eta(uuid, int, uuid) from public, anon;
revoke execute on function errand_ask(uuid, text, uuid) from public, anon;
revoke execute on function errand_answer(uuid, text, uuid) from public, anon;
revoke execute on function errand_result(uuid, text, uuid) from public, anon;
revoke execute on function errand_nudge(uuid, uuid) from public, anon;

grant execute on function errand_eta(uuid, int, uuid) to authenticated, service_role;
grant execute on function errand_ask(uuid, text, uuid) to authenticated, service_role;
grant execute on function errand_answer(uuid, text, uuid) to authenticated, service_role;
grant execute on function errand_result(uuid, text, uuid) to authenticated, service_role;
grant execute on function errand_nudge(uuid, uuid) to authenticated, service_role;
grant execute on function errands_expire(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 11. «Охрана» в уже сохранённые каталоги — как «Не беспокоить» и «Гость» (20260923160000).
-- ---------------------------------------------------------------------------
with fresh(code, action) as (
  values
    ('security', '{"code": "security", "label": "Охрана", "icon": "🚨", "synonyms": ["охрана", "охрану", "вызови охрану", "вызвать охрану"]}'::jsonb)
),
missing as (
  select c.id, jsonb_agg(f.action order by f.code) as rows
    from companies c
    cross join fresh f
   where jsonb_typeof(c.settings #> '{secretary,actions}') = 'array'
     and not exists (
       select 1
         from jsonb_array_elements(c.settings #> '{secretary,actions}') a
        where a->>'code' = f.code
     )
   group by c.id
)
update companies c
   set settings = jsonb_set(c.settings, '{secretary,actions}', (c.settings #> '{secretary,actions}') || m.rows)
  from missing m
 where m.id = c.id
   and jsonb_array_length(c.settings #> '{secretary,actions}') + jsonb_array_length(m.rows) <= 12;
