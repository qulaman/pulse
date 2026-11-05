-- The secretary sees when the director is busy, and nothing else (owner, 2026-11-04; changes
-- D-154 §7 in this one part). Her calendar under RLS holds only her own meetings (events_select),
-- so the desk could not tell «на встрече до 15:00» from «свободен до 16:30» at the door.
--
-- director_busy returns spans of time and only that: no title, no place, no people. Whatever
-- overlaps or touches is one span, so the number of meetings does not show either. A secretary
-- still cannot make or change the director's meetings: edit_event and the policies are not touched.
--
-- «The director's meeting» is the rule of director_meeting_until (20260924150200): he takes part
-- and has not refused, the meeting is not cancelled, no end = one hour. Several directors of one
-- company are one calendar here.

create or replace function director_busy(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company uuid := auth_company_id();
  v_role    text := auth_role();
begin
  -- spelled out: `v_role not in (...)` is NULL for a NULL role, and a NULL condition raises nothing
  if v_company is null or v_role is null or v_role not in ('director', 'secretary') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '31 days' then
    raise exception 'bad_range' using errcode = 'P0001';
  end if;

  return query
  with spans as (
    select distinct e.starts_at as a, coalesce(e.ends_at, e.starts_at + interval '1 hour') as b
      from events e
      join event_participants ep on ep.event_id = e.id
      join profiles p on p.id = ep.user_id
     where e.company_id = v_company
       and e.cancelled_at is null
       and ep.status <> 'declined'
       and p.company_id = v_company
       and p.role = 'director'
       and p.is_active
       and e.starts_at < p_to
       and coalesce(e.ends_at, e.starts_at + interval '1 hour') > p_from
       and coalesce(e.ends_at, e.starts_at + interval '1 hour') > e.starts_at
  ),
  -- a span that begins after everything before it has ended starts a new run
  marked as (
    select s.a, s.b,
           case when s.a <= max(s.b) over (order by s.a, s.b rows between unbounded preceding and 1 preceding)
                then 0 else 1 end as fresh
      from spans s
  ),
  runs as (
    select m.a, m.b, sum(m.fresh) over (order by m.a, m.b rows unbounded preceding) as run
      from marked m
  )
  select min(r.a), max(r.b)
    from runs r
   group by r.run
   order by 1;
end;
$fn$;

comment on function director_busy(timestamptz, timestamptz) is
  'when the directors of the caller''s company are in a meeting: merged spans, nothing about the meetings; director and secretary only';

revoke execute on function director_busy(timestamptz, timestamptz) from public, anon;
grant execute on function director_busy(timestamptz, timestamptz) to authenticated, service_role;
