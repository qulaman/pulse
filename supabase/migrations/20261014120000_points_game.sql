-- D-133: очки и game feel — авто-правила, реакции директора, серии, «Оспорить», Эфир.
--
-- 1. Авто-правила (D-13, D-28, D-31) на переходах задачи: принял быстро, сдал в срок, сдал
--    досрочно; штраф за просрочку есть, но выключен. Значения — `settings.points_rules`,
--    при `points_enabled = false` не начисляется ничего. Своя задача очков не даёт.
-- 2. Серия (И-69): `profiles.streak_count` считает база на «Принято» — сдачи в срок подряд,
--    задача без срока не считается и не рвёт. Серия — факт работы: считается и при
--    выключенных очках, показывается — только при включённых.
-- 3. Реакции директора на задачу (И-68): одна на задачу, у каждой своя цена в
--    `settings.points_rules.reactions` (👍 1, 🔥 10, ❤️ 100, остальные 0). Строки `reaction`
--    по задаче в сумме всегда равны цене текущей реакции: сменил — доплата или списание
--    разницы, снял — списание. Журнал только дописывается (принцип 4).
-- 4. «Оспорить» (D-14): сотрудник оспаривает минус, директор возвращает очки одной строкой
--    или оставляет; пуш в обе стороны.
-- 5. Эфир (И-46): выдача награды и похвала директора — публичные события `ether_events`,
--    без пуша команде; минус туда не попадает никогда (D-45). Похвала «тихая», если директор
--    снял галочку «Сказать в Эфире» (`point_transactions.quiet`): тогда её нет и на стене.

-- ---------------------------------------------------------------------------
-- settings helpers
-- ---------------------------------------------------------------------------
create or replace function points_rule(p_settings jsonb, p_key text, p_default int) returns int
language sql immutable
as $$
  select case when (p_settings -> 'points_rules' ->> p_key) ~ '^-?[0-9]{1,6}$'
              then (p_settings -> 'points_rules' ->> p_key)::int
              else p_default end
$$;

comment on function points_rule(jsonb, text, int) is 'settings.points_rules.<key> as int; a missing or broken value gives the default (D-133)';

-- a reaction's price: never negative — taking points away is a manual act with a reason (D-30)
create or replace function reaction_points(p_settings jsonb, p_code text) returns int
language sql immutable
as $$
  select case when (p_settings -> 'points_rules' -> 'reactions' ->> p_code) ~ '^[0-9]{1,6}$'
              then (p_settings -> 'points_rules' -> 'reactions' ->> p_code)::int
              else case p_code when 'like' then 1 when 'fire' then 10 when 'heart' then 100 else 0 end
         end
$$;

create or replace function reaction_glyph(p_code text) returns text
language sql immutable
as $$
  select case p_code
           when 'like' then '👍' when 'fire' then '🔥' when 'heart' then '❤️'
           when 'clap' then '👏' when 'zap' then '⚡' when 'think' then '🤔' when 'dislike' then '👎'
           else '' end
$$;

-- ---------------------------------------------------------------------------
-- point_transactions.quiet — a manual award the director did not tell the team about
-- ---------------------------------------------------------------------------
alter table point_transactions add column if not exists quiet boolean not null default false;

comment on column point_transactions.quiet is 'manual award kept off Эфир and the wall (D-133): «Сказать в Эфире» unticked, or a dispute refund';

-- ---------------------------------------------------------------------------
-- when the task reached the assignee: the latest «Новая задача» push due, else the task's own time
-- ---------------------------------------------------------------------------
create or replace function task_sent_at(p_task uuid, p_fallback timestamptz) returns timestamptz
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select max(greatest(d.created_at, d.deliver_after))
       from notification_deliveries d
      where d.task_id = p_task and d.event_kind = 'task_sent'),
    p_fallback)
$$;

-- ---------------------------------------------------------------------------
-- the streak: accepted handovers in time, newest first, until the first late one
-- ---------------------------------------------------------------------------
create or replace function task_streak_of(p_company uuid, p_user uuid) returns int
language sql stable security definer set search_path = public
as $$
  select count(*)::int
    from (
      select sum(case when t.completed_at <= t.deadline then 0 else 1 end)
               over (order by t.closed_at desc, t.id rows unbounded preceding) as breaks
        from tasks t
       where t.company_id = p_company and t.assignee_id = p_user and t.status = 'done'
         and t.deadline is not null and t.completed_at is not null
    ) s
   where s.breaks = 0
$$;

comment on function task_streak_of(uuid, uuid) is 'И-69: handovers (completed_at) by the deadline in a row, newest first; no deadline neither counts nor breaks';

-- ---------------------------------------------------------------------------
-- tasks_points — the auto-rules and the streak, after the status moved
-- ---------------------------------------------------------------------------
create or replace function tasks_points() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_settings jsonb;
  v_role     user_role;
  v_avail    availability_t;
  v_title    text := '«' || left(coalesce(new.title, 'Задача'), 60) || '»';
  v_sent     timestamptz;
  v_points   int;
  v_code     text;
  v_reason   text;
begin
  if new.status = old.status or new.assignee_id is null or new.status not in ('accepted', 'done') then
    return null;
  end if;

  select p.role, p.availability into v_role, v_avail from profiles p where p.id = new.assignee_id;
  if v_role is null or not team_role(v_role) then
    return null;
  end if;

  -- the streak is a fact of the work: kept whether points are on or off
  if new.status = 'done' then
    update profiles p
       set streak_count = task_streak_of(new.company_id, new.assignee_id),
           streak_updated_at = now()
     where p.id = new.assignee_id;
  end if;

  select c.settings into v_settings from companies c where c.id = new.company_id;
  if coalesce(v_settings ->> 'points_enabled', 'false') <> 'true' or new.author_id = new.assignee_id then
    return null;
  end if;

  v_sent := task_sent_at(new.id, coalesce(new.scheduled_send_at, new.created_at));

  if new.status = 'accepted' and old.status = 'sent' and new.accepted_at is not null then
    v_points := points_rule(v_settings, 'quick_accept', 1);
    if v_points > 0
       and new.accepted_at <= v_sent + make_interval(mins => greatest(points_rule(v_settings, 'quick_accept_min', 10), 1)) then
      v_code := 'quick_accept';
      v_reason := 'принял быстро: ';
    end if;
  elsif new.status = 'done' and new.deadline is not null and new.completed_at is not null then
    if new.completed_at <= new.deadline then
      -- «досрочно» — handed over within the first half of the time it was given
      if new.deadline > v_sent and new.completed_at <= v_sent + (new.deadline - v_sent) / 2 then
        v_code := 'early';
        v_points := points_rule(v_settings, 'early', 5);
        v_reason := 'досрочно: ';
      else
        v_code := 'on_time';
        v_points := points_rule(v_settings, 'on_time', 3);
        v_reason := 'в срок: ';
      end if;
    elsif v_settings -> 'points_rules' ->> 'late_on' = 'true' and v_avail = 'active' then
      -- off by default (D-28); never on somebody away on leave or sick (D-09)
      v_code := 'late';
      v_points := -abs(points_rule(v_settings, 'late', 5));
      v_reason := 'после срока: ';
    end if;
  end if;

  if v_code is not null and v_points <> 0 then
    -- one bonus a task and rule: a second «Принято» cannot happen, a replayed update pays nothing (D-31)
    insert into point_transactions (company_id, user_id, amount, reason, source, rule_code, task_id)
    values (new.company_id, new.assignee_id, v_points, v_reason || v_title, 'auto_rule', v_code, new.id)
    on conflict (task_id, rule_code) where source = 'auto_rule' do nothing;
  end if;

  return null;
end;
$fn$;

drop trigger if exists trg_tasks_points on tasks;
create trigger trg_tasks_points
  after update of status on tasks
  for each row execute function tasks_points();

-- the streaks of today's data, once
update profiles p
   set streak_count = task_streak_of(p.company_id, p.id),
       streak_updated_at = now()
 where team_role(p.role);

-- ---------------------------------------------------------------------------
-- task_reactions — the director's one reaction to a task (И-68)
-- ---------------------------------------------------------------------------
create table task_reactions (
  task_id    uuid not null references tasks on delete cascade,
  author_id  uuid not null references profiles,
  company_id uuid not null references companies,
  code       text not null check (code in ('like', 'fire', 'heart', 'clap', 'zap', 'think', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, author_id)
);

comment on table task_reactions is 'D-133: the director''s reaction to a task; its points are point_transactions source=reaction';

create index task_reactions_company_updated_idx on task_reactions (company_id, updated_at desc);
create index task_reactions_author_idx on task_reactions (author_id);

alter table task_reactions enable row level security;

-- the author, the director and the task's assignee; writes only through react_to_task()
create policy task_reactions_select on task_reactions for select using (
  company_id = (select auth_company_id())
  and (
    author_id = (select auth.uid())
    or (select auth_role()) = 'director'
    or exists (select 1 from tasks t where t.id = task_reactions.task_id and t.assignee_id = (select auth.uid()))
  )
);

create or replace function react_to_task(
  p_task uuid,
  p_code text,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid     uuid := client_request_id;
  v_company  uuid := auth_company_id();
  v_user     uuid := auth.uid();
  v_task     tasks%rowtype;
  v_old      text;
  v_settings jsonb;
  v_role     user_role;
  v_paid     int;
  v_target   int := 0;
  v_delta    int := 0;
  v_reason   text;
  v_first    text;
  v_body     text;
  v_result   jsonb;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_code is not null and p_code not in ('like', 'fire', 'heart', 'clap', 'zap', 'think', 'dislike') then
    raise exception 'unknown_reaction' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;
    if not found then
      select b.result into v_result from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  -- the task row is the lock: two quick taps settle one after the other
  select * into v_task from tasks t where t.id = p_task and t.company_id = v_company for update;
  if v_task.id is null then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;
  if v_task.status in ('scheduled', 'revoked') or v_task.assignee_id is null or v_task.assignee_id = v_user then
    raise exception 'not_reactable' using errcode = 'P0001';
  end if;

  select r.code into v_old from task_reactions r where r.task_id = p_task and r.author_id = v_user;

  if p_code is null then
    delete from task_reactions r where r.task_id = p_task and r.author_id = v_user;
  else
    insert into task_reactions (task_id, author_id, company_id, code)
    values (p_task, v_user, v_company, p_code)
    on conflict (task_id, author_id) do update set code = excluded.code, updated_at = now();
  end if;

  -- points: this director's reaction rows on the task add up to the price of the current reaction
  select c.settings into v_settings from companies c where c.id = v_company;
  select p.role into v_role from profiles p where p.id = v_task.assignee_id;
  if coalesce(v_settings ->> 'points_enabled', 'false') = 'true' and v_role is not null and team_role(v_role) then
    if p_code is not null then
      v_target := reaction_points(v_settings, p_code);
    end if;
    select coalesce(sum(t.amount), 0)::int into v_paid
      from point_transactions t
     where t.task_id = p_task and t.user_id = v_task.assignee_id and t.source = 'reaction' and t.actor_id = v_user;
    v_delta := v_target - v_paid;
    if v_delta <> 0 then
      v_reason := case
                    when p_code is null then 'реакция снята'
                    when v_old is null or v_old = p_code then 'реакция ' || reaction_glyph(p_code)
                    else 'реакция ' || reaction_glyph(v_old) || ' → ' || reaction_glyph(p_code)
                  end || ': «' || left(coalesce(v_task.title, 'Задача'), 60) || '»';
      insert into point_transactions (company_id, user_id, amount, reason, source, task_id, actor_id)
      values (v_company, v_task.assignee_id, v_delta, v_reason, 'reaction', p_task, v_user);
    end if;
  end if;

  -- the push: a new reaction only; one not yet sent is rewritten, never doubled
  if p_code is not null and v_old is distinct from p_code then
    select nullif(split_part(p.full_name, ' ', 1), '') into v_first from profiles p where p.id = v_user;
    v_body := '«' || left(coalesce(v_task.title, 'Задача'), 90) || '»'
              || case when v_delta > 0 then ' · +' || v_delta || ' ' || ru_plural(v_delta, 'очко', 'очка', 'очков') else '' end;
    update notification_deliveries d
       set meta = jsonb_build_object('title', reaction_glyph(p_code) || coalesce(' · ' || v_first, ''),
                                     'body', v_body, 'url', '/tasks/' || p_task)
     where d.task_id = p_task and d.user_id = v_task.assignee_id
       and d.event_kind = 'reaction' and d.status = 'queued';
    if not found then
      insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
      values (v_company, v_task.assignee_id, p_task, 'reaction',
              jsonb_build_object('title', reaction_glyph(p_code) || coalesce(' · ' || v_first, ''),
                                 'body', v_body, 'url', '/tasks/' || p_task));
    end if;
  end if;

  v_result := jsonb_build_object('task_id', p_task, 'code', p_code, 'points', v_delta);
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- point_disputes — «Оспорить» a minus (D-14)
-- ---------------------------------------------------------------------------
create table point_disputes (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies,
  transaction_id uuid not null unique references point_transactions,
  user_id        uuid not null references profiles,
  text           text not null check (length(trim(text)) > 0),
  status         text not null default 'open' check (status in ('open', 'refunded', 'kept')),
  answer         text,
  resolved_by    uuid references profiles,
  resolved_at    timestamptz,
  refund_id      uuid references point_transactions,
  created_at     timestamptz not null default now()
);

comment on table point_disputes is 'D-133 (D-14): one dispute per minus; a refund is a quiet manual row, the minus stays in the ledger';

create index point_disputes_company_status_idx on point_disputes (company_id, status, created_at desc);
create index point_disputes_user_idx on point_disputes (user_id);
create index point_disputes_resolved_by_idx on point_disputes (resolved_by);
create index point_disputes_refund_idx on point_disputes (refund_id);

alter table point_disputes enable row level security;

create policy point_disputes_select on point_disputes for select using (
  company_id = (select auth_company_id())
  and (user_id = (select auth.uid()) or (select auth_role()) = 'director')
);

create or replace function dispute_points(
  p_transaction uuid,
  p_text text,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_tx      point_transactions%rowtype;
  v_id      uuid;
  v_first   text;
  v_result  jsonb;
begin
  if length(trim(coalesce(p_text, ''))) = 0 then
    raise exception 'text_required' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;
    if not found then
      select b.result into v_result from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  select * into v_tx from point_transactions t
   where t.id = p_transaction and t.company_id = v_company and t.user_id = v_user;
  if v_tx.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- only a minus is disputed; a hold is the person's own order, not a judgement
  if v_tx.amount >= 0 or v_tx.source in ('shop_hold', 'shop_release') then
    raise exception 'not_disputable' using errcode = 'P0001';
  end if;
  if exists (select 1 from point_disputes d where d.transaction_id = v_tx.id) then
    raise exception 'already_disputed' using errcode = 'P0001';
  end if;

  insert into point_disputes (company_id, transaction_id, user_id, text)
  values (v_company, v_tx.id, v_user, left(trim(p_text), 500))
  returning id into v_id;

  select nullif(split_part(p.full_name, ' ', 1), '') into v_first from profiles p where p.id = v_user;
  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  select v_company, p.id, 'points_dispute',
         jsonb_build_object('title', 'Оспаривает' || coalesce(' · ' || v_first, ''),
                            'body', v_tx.amount || ' «' || left(v_tx.reason, 60) || '» · ' || left(trim(p_text), 90),
                            'url', '/rating#disputes')
    from profiles p
   where p.company_id = v_company and p.role = 'director' and p.is_active;

  v_result := jsonb_build_object('id', v_id, 'status', 'open');
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

create or replace function resolve_points_dispute(
  p_dispute uuid,
  p_refund boolean,
  p_answer text default null,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_dispute point_disputes%rowtype;
  v_tx      point_transactions%rowtype;
  v_refund  uuid;
  v_answer  text := nullif(left(trim(coalesce(p_answer, '')), 500), '');
  v_result  jsonb;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;
    if not found then
      select b.result into v_result from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  select * into v_dispute from point_disputes d
   where d.id = p_dispute and d.company_id = v_company
   for update;
  if v_dispute.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_dispute.status <> 'open' then
    raise exception 'already_resolved' using errcode = 'P0001';
  end if;
  select * into v_tx from point_transactions t where t.id = v_dispute.transaction_id;

  if p_refund then
    -- the minus stays; one quiet row gives it back — never on Эфир or the wall
    insert into point_transactions (company_id, user_id, amount, reason, source, rule_code, actor_id, quiet)
    values (v_company, v_dispute.user_id, -v_tx.amount, 'возврат: ' || v_tx.reason, 'manual', 'refund', v_user, true)
    returning id into v_refund;
  end if;

  update point_disputes d
     set status = case when p_refund then 'refunded' else 'kept' end,
         answer = v_answer, resolved_by = v_user, resolved_at = now(), refund_id = v_refund
   where d.id = v_dispute.id;

  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  values (v_company, v_dispute.user_id, 'points_answer',
          jsonb_build_object('title', case when p_refund then 'Очки вернули · +' || (-v_tx.amount) else 'Начисление оставили' end,
                             'body', coalesce(v_answer, '«' || left(v_tx.reason, 90) || '»'),
                             'url', '/rating'));

  v_result := jsonb_build_object('id', v_dispute.id, 'status', case when p_refund then 'refunded' else 'kept' end);
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- ether_events — what the whole team may see: a reward handed out, the director's praise (И-46)
-- ---------------------------------------------------------------------------
create table ether_events (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies,
  kind           text not null check (kind in ('merch', 'praise')),
  user_id        uuid not null references profiles,
  actor_id       uuid references profiles,
  title          text not null,
  icon           text,
  amount         int,
  order_id       uuid references orders on delete cascade,
  transaction_id uuid references point_transactions,
  created_at     timestamptz not null default now()
);

comment on table ether_events is 'D-133 (И-46): public good news on Эфир — never a minus (D-45), no push to the team';

create index ether_events_company_created_idx on ether_events (company_id, created_at desc);
create index ether_events_user_idx on ether_events (user_id);
create index ether_events_actor_idx on ether_events (actor_id);
create index ether_events_order_idx on ether_events (order_id);
create index ether_events_transaction_idx on ether_events (transaction_id);

alter table ether_events enable row level security;

create policy ether_events_select on ether_events for select using (
  company_id = (select auth_company_id()) and (select auth_role()) <> 'tv'
);
-- the director takes a line off Эфир as he takes an announcement down; rows are born in triggers only
create policy ether_events_delete on ether_events for delete using (
  company_id = (select auth_company_id()) and (select auth_role()) = 'director'
);

create or replace function ether_events_praise() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_settings jsonb;
begin
  if new.source <> 'manual' or new.amount <= 0 or new.quiet then
    return null;
  end if;
  select c.settings into v_settings from companies c where c.id = new.company_id;
  if coalesce(v_settings ->> 'points_enabled', 'false') <> 'true'
     or coalesce(v_settings -> 'ether_events' ->> 'praise', 'true') = 'false' then
    return null;
  end if;
  insert into ether_events (company_id, kind, user_id, actor_id, title, amount, transaction_id)
  values (new.company_id, 'praise', new.user_id, new.actor_id, new.reason, new.amount, new.id);
  return null;
end;
$fn$;

drop trigger if exists trg_ether_events_praise on point_transactions;
create trigger trg_ether_events_praise
  after insert on point_transactions
  for each row execute function ether_events_praise();

create or replace function ether_events_merch() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_settings jsonb;
  v_title    text;
  v_icon     text;
begin
  if new.status <> 'delivered' or old.status is not distinct from 'delivered' then
    return null;
  end if;
  select c.settings into v_settings from companies c where c.id = new.company_id;
  if coalesce(v_settings ->> 'points_enabled', 'false') <> 'true'
     or coalesce(v_settings -> 'ether_events' ->> 'merch', 'true') = 'false' then
    return null;
  end if;
  select i.title, i.icon into v_title, v_icon from shop_items i where i.id = new.item_id;
  insert into ether_events (company_id, kind, user_id, title, icon, amount, order_id)
  values (new.company_id, 'merch', new.user_id, coalesce(v_title, 'Награда'), v_icon, new.price, new.id);
  return null;
end;
$fn$;

drop trigger if exists trg_ether_events_merch on orders;
create trigger trg_ether_events_merch
  after update of status on orders
  for each row execute function ether_events_merch();

-- ---------------------------------------------------------------------------
-- the wall: praise only — an automatic bonus is already a «сдал» line, a quiet award stays private
-- (20260917190000_tv_events.sql otherwise word for word)
-- ---------------------------------------------------------------------------
create or replace function tv_events_points() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  -- на экран идёт только поощрение: списание в магазине — движение по счёту, а минус
  -- сотруднику публично не показывают (D-45); авто-правило и тихая похвала — тоже нет (D-133)
  if new.amount <= 0 or new.source in ('shop_hold', 'shop_release', 'auto_rule') or new.quiet then
    return null;
  end if;
  perform tv_emit(new.company_id, 'points', new.user_id, new.task_id, new.reason, new.amount);
  return null;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- tv_rating — 20260925180000_tv_wall_v4.sql word for word, except: the five carry their streak,
-- «награды» are the director's own (no automatic bonus, no quiet award, no refund), a refund is
-- not «заработано» (D-133)
-- ---------------------------------------------------------------------------
create or replace function tv_rating(p_guest boolean default false, p_period text default 'week') returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_state   tv_state;
  v_points  boolean;
  v_period  text := case when p_period = 'month' then 'month' else 'week' end;
  v_span    interval;
  v_from    timestamptz;
  v_prev    timestamptz;
  v_result  jsonb;
begin
  if auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  select * into v_state from tv_state where company_id = v_company;
  if coalesce(p_guest, false) or (found and tv_guest_on(v_state)) then
    return jsonb_build_object('hidden', true);
  end if;

  select coalesce((c.settings->>'points_enabled')::boolean, false) into v_points
    from companies c where c.id = v_company;
  if not coalesce(v_points, false) then
    return jsonb_build_object('hidden', false, 'enabled', false, 'period', v_period);
  end if;

  v_span := case when v_period = 'month' then interval '1 month' else interval '7 days' end;
  v_from := now() - v_span;
  v_prev := v_from - v_span;

  with people as (
    select p.id, p.full_name, p."position", p.avatar_url, p.streak_count
      from profiles p
     where p.company_id = v_company and p.is_active
       and p.role in ('employee', 'manager', 'shopkeeper')
  ),
  cur as (
    select t.user_id, sum(t.amount)::int as pts
      from point_transactions t
     where t.company_id = v_company and t.created_at >= v_from
     group by t.user_id
  ),
  prev as (
    select t.user_id, sum(t.amount)::int as pts
      from point_transactions t
     where t.company_id = v_company and t.created_at >= v_prev and t.created_at < v_from
     group by t.user_id
  ),
  done as (
    select k.assignee_id,
           count(*)::int as total,
           (count(*) filter (where k.deadline is null or k.closed_at <= k.deadline))::int as on_time
      from tasks k
     where k.company_id = v_company and k.status = 'done' and k.closed_at >= v_from
     group by k.assignee_id
  ),
  ranked as (
    select pe.id, pe.full_name, pe."position", pe.avatar_url, pe.streak_count,
           coalesce(cur.pts, 0) as pts,
           coalesce(cur.pts, 0) - coalesce(prev.pts, 0) as delta,
           coalesce(done.total, 0) as done,
           coalesce(done.on_time, 0) as on_time,
           dense_rank() over (order by coalesce(cur.pts, 0) desc, pe.full_name)::int as rnk
      from people pe
      left join cur  on cur.user_id = pe.id
      left join prev on prev.user_id = pe.id
      left join done on done.assignee_id = pe.id
  ),
  awards as (
    -- what was given and why: only rewards, never a penalty or a shop hold (D-45); the director's
    -- own — an automatic bonus is a «сдал» line already, a quiet award and a refund stay private (D-133)
    select p.full_name as name, t.amount, t.reason, t.created_at as at
      from point_transactions t
      join profiles p on p.id = t.user_id
     where t.company_id = v_company and t.created_at >= v_from
       and t.amount > 0 and ((t.source = 'manual' and not t.quiet) or t.source = 'reaction')
     order by t.created_at desc
     limit 3
  )
  select jsonb_build_object(
    'hidden', false,
    'enabled', true,
    'period', v_period,
    -- the first five with points: no bottom of the list on the wall (D-45)
    'top', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.full_name, 'position', r."position", 'avatar_url', r.avatar_url,
               'points', r.pts, 'rank', r.rnk, 'delta', r.delta, 'done', r.done, 'on_time', r.on_time,
               'streak', r.streak_count
             ) order by r.rnk)
        from ranked r where r.rnk <= 5 and r.pts > 0
    ), '[]'::jsonb),
    -- who grew most against the span before: growth only
    'riser', (
      select jsonb_build_object('id', r.id, 'name', r.full_name, 'avatar_url', r.avatar_url, 'delta', r.delta, 'points', r.pts)
        from ranked r where r.delta > 0 and r.pts > 0
       order by r.delta desc, r.full_name
       limit 1
    ),
    'awards', coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'amount', a.amount, 'reason', a.reason, 'at', a.at) order by a.at desc) from awards a), '[]'::jsonb),
    'team', jsonb_build_object(
      'done', (select coalesce(sum(r.done), 0) from ranked r),
      'on_time', (select coalesce(sum(r.on_time), 0) from ranked r),
      'earned', (select coalesce(sum(t.amount), 0)
                   from point_transactions t
                  where t.company_id = v_company and t.created_at >= v_from
                    and t.amount > 0 and t.source in ('manual', 'reaction', 'auto_rule')
                    and t.rule_code is distinct from 'refund'),
      'people', (select count(*) from ranked r where r.pts > 0)
    )
  ) into v_result;

  return v_result;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- award_points — the D-48 body plus «Сказать в Эфире» (p_public); the old signature goes, or two
-- overloads would make every named call ambiguous
-- ---------------------------------------------------------------------------
drop function if exists award_points(uuid, int, text, uuid);

create or replace function award_points(
  p_user_id uuid,
  p_amount int,
  p_reason text,
  client_request_id uuid default null,
  p_public boolean default true
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_result  jsonb;
  v_id      uuid;
  v_balance int;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_amount = 0 or p_amount is null then
    raise exception 'amount_required' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from profiles p where p.id = p_user_id and p.company_id = v_company and p.is_active) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;
    if not found then
      select b.result into v_result from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  insert into point_transactions (company_id, user_id, amount, reason, source, actor_id, quiet)
  values (v_company, p_user_id, p_amount, trim(p_reason), 'manual', v_user, not coalesce(p_public, true))
  returning id into v_id;

  select coalesce(sum(amount), 0) into v_balance
    from point_transactions where company_id = v_company and user_id = p_user_id;

  v_result := jsonb_build_object('id', v_id, 'balance', v_balance);
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- delivery: «Оспаривает» is the director's «Магазин и очки»; a reaction and an answer to the
-- employee wait for the company window like any other good news
-- ---------------------------------------------------------------------------
create or replace function delivery_category(p_kind text, p_meta jsonb) returns text
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_errand text := p_meta ->> 'errand_id';
begin
  if p_kind = 'pending_review' then return 'review'; end if;
  if p_kind = 'declined' then return 'declined'; end if;
  if p_kind = 'question' or (p_kind = 'message' and p_meta ->> 'is_question' = 'true') then return 'questions'; end if;
  if p_kind in ('message', 'reply') then return 'messages'; end if;
  if p_kind = 'task_unseen' then return 'unseen'; end if;
  if p_kind = 'task_overdue' then return 'overdue'; end if;
  if p_kind = 'team_channel' then return 'team'; end if;
  if p_kind like 'errand\_%' then
    -- the alarm and its receipts («Охрана на месте») are never tuned away
    if p_meta ->> 'urgent' = 'true'
       or (v_errand ~ '^[0-9a-f-]{36}$' and exists (select 1 from errands e where e.id = v_errand::uuid and e.urgent)) then
      return 'alarm';
    end if;
    return 'secretary';
  end if;
  if p_kind like 'visit\_%' then return 'secretary'; end if;
  if p_kind like 'event\_%' then return 'calendar'; end if;
  if p_kind like 'shop\_%' or p_kind like 'points\_%' then return 'shop'; end if;
  if p_kind = 'note_reminder' then return 'reminders'; end if;
  if p_kind in ('digest', 'day_summary', 'test') then return 'system'; end if;
  -- task_sent / rework / done / revoked / deadline_extended / announcement / reaction
  return 'tasks';
end
$fn$;

-- 20260924150200_notify_prefs.sql word for word, plus 'reaction' and 'points_answer' in the window list
create or replace function notification_deliveries_deliver_after() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role    text;
  v_prefs   jsonb;
  v_mode    text := 'now';
  v_vip     boolean := false;
  v_until   timestamptz;
  v_now     timestamptz := now();
  -- computed first, applied at the end: a broken rule leaves the row as it was
  r_mode    text := 'now';
  r_held    text;
  r_after   timestamptz;
  r_silent  boolean := false;
  r_private boolean := false;
  r_muted   boolean := false;
begin
  new.category := delivery_category(new.event_kind, new.meta);
  select p.role::text into v_role from profiles p where p.id = new.user_id;

  if v_role is distinct from 'director' then
    -- the fixed policy (D-114): what reaches an employee, a secretary or a shopkeeper and can
    -- wait, waits for the company window; a task whose moment the producer already decided
    -- (batch / «отправить сейчас» / scheduled reassign), a reminder, a request to the
    -- secretary do not
    if new.event_kind in ('reply', 'rework', 'done', 'revoked', 'deadline_extended', 'announcement',
                          'shop_order', 'shop_approved', 'shop_ready', 'shop_cancelled',
                          'event_invite', 'event_moved', 'event_cancelled',
                          'reaction', 'points_answer') then
      new.deliver_after := greatest(new.deliver_after, coalesce(next_delivery_slot(new.company_id, v_now), v_now));
    end if;
    -- a message to somebody who is not the task's author is a message to an employee
    if new.event_kind = 'message' and exists (
         select 1 from tasks t where t.id = new.task_id and t.author_id <> new.user_id
       ) then
      new.deliver_after := greatest(new.deliver_after, coalesce(next_delivery_slot(new.company_id, v_now), v_now));
    end if;
    return new;
  end if;

  -- the director: the alarm and the product's own pushes are never tuned away
  if new.category in ('alarm', 'system') then
    return new;
  end if;

  begin
    v_prefs := notify_prefs_of(new.user_id);
    if new.category not in ('reminders', 'tasks') then
      v_mode := coalesce(v_prefs -> 'modes' ->> new.category, 'now');
      if v_mode not in ('now', 'quiet', 'digest', 'off') then
        v_mode := 'now';
      end if;
    end if;

    if v_mode = 'off' then
      r_muted := true;
    else
      if new.task_id is not null then
        select exists (
          select 1 from tasks t
           where t.id = new.task_id and t.assignee_id is not null
             and (v_prefs -> 'vip') ? t.assignee_id::text
        ) into v_vip;
      end if;
      -- an important person's news is never quiet and never waits for the digest
      if v_vip and v_mode in ('quiet', 'digest') then
        v_mode := 'now';
      end if;
      r_silent := v_mode = 'quiet';
      r_private := v_prefs ->> 'lock_text' = 'short';

      v_until := director_quiet_until(v_prefs, v_now);
      if v_until is not null and not (
           (new.category = 'reminders' and coalesce(v_prefs -> 'pass' ->> 'reminders', 'true') = 'true')
        or (new.event_kind = 'visit_arrived' and coalesce(v_prefs -> 'pass' ->> 'visitors', 'true') = 'true')
        or (v_vip and v_prefs -> 'pass' ->> 'vip' = 'true')
      ) then
        r_mode := 'digest';
        r_held := 'quiet';
        r_after := v_until;
      elsif v_prefs ->> 'meetings' = 'true'
            and not (new.category = 'reminders' or new.event_kind in ('event_reminder', 'visit_arrived') or v_vip)
            and director_meeting_until(new.user_id, v_now) is not null then
        r_mode := 'digest';
        r_held := 'meeting';
        r_after := director_meeting_until(new.user_id, v_now);
      elsif v_mode = 'digest' then
        r_mode := 'digest';
        r_held := 'schedule';
        r_after := director_digest_slot(v_prefs, v_now);
      end if;
    end if;
  exception when others then
    -- never let a rule break the producer's transaction: the row goes as before
    r_mode := 'now'; r_held := null; r_after := null; r_silent := false; r_private := false; r_muted := false;
  end;

  if r_muted then
    new.status := 'failed';
    new.attempts := 3;
    new.last_error := 'muted';
    return new;
  end if;
  new.mode := r_mode;
  new.held := r_held;
  new.silent := r_silent;
  new.private := r_private;
  if r_after is not null then
    new.deliver_after := greatest(new.deliver_after, r_after);
  end if;
  return new;
end
$fn$;

-- ---------------------------------------------------------------------------
-- realtime: the reaction lights the card, a dispute reaches the rating, Эфир fills itself
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array['task_reactions', 'point_disputes', 'ether_events'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table %I', v_table);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
revoke execute on function award_points(uuid, int, text, uuid, boolean) from public, anon;
revoke execute on function react_to_task(uuid, text, uuid) from public, anon;
revoke execute on function dispute_points(uuid, text, uuid) from public, anon;
revoke execute on function resolve_points_dispute(uuid, boolean, text, uuid) from public, anon;
revoke execute on function task_sent_at(uuid, timestamptz) from public, anon;
revoke execute on function task_streak_of(uuid, uuid) from public, anon;

grant execute on function award_points(uuid, int, text, uuid, boolean) to authenticated, service_role;
grant execute on function react_to_task(uuid, text, uuid) to authenticated, service_role;
grant execute on function dispute_points(uuid, text, uuid) to authenticated, service_role;
grant execute on function resolve_points_dispute(uuid, boolean, text, uuid) to authenticated, service_role;
grant execute on function task_sent_at(uuid, timestamptz) to service_role;
grant execute on function task_streak_of(uuid, uuid) to service_role;
