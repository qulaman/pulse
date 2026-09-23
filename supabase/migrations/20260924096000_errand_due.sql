-- D-106 §8: просьба секретарю ко времени — «Такси к 18:00», «кофе к 15:00 на встречу».
-- Автомат заявки (D-79 §1) не меняется: просьба уходит секретарю сразу, с временем в
-- заголовке пуша, её берут («Принял») как обычно. Время живёт в errands.due_at; за 10 минут
-- до него минутный свип напоминает тому, кто взял (не взял никто — всем, кто на месте), один
-- раз — errands.due_reminded_at, как escalated_at у повтора. Просьба, заданная меньше чем за
-- 20 минут, отдельного напоминания не получает: она и так только что пришла.
--
-- Версия 20260924096000 — после последней применённой на dev (20260924095000) и до ещё не
-- применённой 20260924100000 соседней сессии: её push останется по порядку.

alter table errands add column if not exists due_at timestamptz;
alter table errands add column if not exists due_reminded_at timestamptz;

comment on column errands.due_at is 'D-106 §8: the request is needed by this moment («к 18:00»)';
comment on column errands.due_reminded_at is 'D-106 §8: the one reminder 10 minutes before due_at went out at this moment';

-- ---------------------------------------------------------------------------
-- 1. Outbox заявки: тело — 20260923235000 §7, заголовок получает «· к 18:00» (Актобе),
--    «· завтра к 17:30», если срок — уже на следующий день от момента просьбы.
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_errand() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_name text;
  v_due  text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'sent' then
      v_due := case
                 when new.due_at is null then ''
                 when (new.due_at at time zone 'Asia/Aqtobe')::date > (new.created_at at time zone 'Asia/Aqtobe')::date
                   then ' · завтра к ' || to_char(new.due_at at time zone 'Asia/Aqtobe', 'HH24:MI')
                 else ' · к ' || to_char(new.due_at at time zone 'Asia/Aqtobe', 'HH24:MI')
               end;
      insert into notification_deliveries (company_id, user_id, event_kind, meta)
      select new.company_id, r, 'errand_sent',
             jsonb_build_object(
               'title', case
                          when new.urgent and new.kind = 'security' then '🚨 Вызови охрану!'
                          when new.urgent then '🚨 Срочно: ' || new.label
                          else new.label || v_due
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
-- 2. Напоминание за 10 минут до срока — минутный тик POST /api/push/sweep.
--    Взятую — тому, кто взял; ничью — кто на месте (errand_recipients). Один раз.
--    После долгого простоя прошедшие сроки не напоминаются.
-- ---------------------------------------------------------------------------
create or replace function errands_due_remind(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_errand errands%rowtype;
  v_when   text;
  v_count  int := 0;
begin
  for v_errand in
    select e.* from errands e
     where e.due_at is not null
       and e.due_reminded_at is null
       and e.status in ('sent', 'accepted')
       and e.due_at - interval '10 minutes' <= p_now
       and e.due_at > p_now - interval '5 minutes'
       and e.created_at <= e.due_at - interval '20 minutes'
     order by e.due_at
     for update of e skip locked
  loop
    v_when := to_char(v_errand.due_at at time zone 'Asia/Aqtobe', 'HH24:MI');
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select v_errand.company_id, r, 'errand_sent',
           jsonb_build_object(
             'title', 'К ' || v_when || ': ' || v_errand.label,
             'body', coalesce(v_errand.note, 'Через 10 минут'),
             'errand_id', v_errand.id,
             'url', '/secretary?e=' || v_errand.id,
             'repeat', true,
             'due', true)
      from (
        select v_errand.claimed_by as r where v_errand.status = 'accepted' and v_errand.claimed_by is not null
        union all
        select x from errand_recipients(v_errand.company_id, v_errand.author_id) x
         where v_errand.status = 'sent' or v_errand.claimed_by is null
      ) targets;

    update errands e set due_reminded_at = p_now where e.id = v_errand.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

revoke execute on function errands_due_remind(timestamptz) from public, anon, authenticated;
grant execute on function errands_due_remind(timestamptz) to service_role;
