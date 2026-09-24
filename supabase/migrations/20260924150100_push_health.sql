-- D-114, stage 2: whose channel is dead — seen by the people who run the team.
--
-- A subscription now remembers how the last push went (`last_ok_at` / `last_error*`), carries a
-- human name of the device («iPhone · Safari») and an `enabled` switch — the director turns off
-- his laptop, an employee has no switch (their device list is not shown to them). The worker
-- writes the outcome; the browser re-registers itself on every app start (lib/push/client.ts),
-- so a subscription the push service dropped (404/410) comes back without anybody noticing.
--
-- push_health(): one row per active person of the company (not the wall) — devices, the last
-- successful push, the last «увидел», the last error and when a push found no device at all.
-- The director and the secretary call it (they run the roster, D-104); the verdict in words
-- is rendered by lib/push/health.ts.

alter table push_subscriptions
  add column if not exists label         text,
  add column if not exists enabled       boolean not null default true,
  add column if not exists last_ok_at    timestamptz,
  add column if not exists last_error    text,
  add column if not exists last_error_at timestamptz,
  add column if not exists updated_at    timestamptz not null default now();

create or replace function push_health() returns table (
  user_id            uuid,
  devices            int,
  enabled_devices    int,
  last_ok_at         timestamptz,
  last_error         text,
  last_error_at      timestamptz,
  last_seen_at       timestamptz,
  no_device_at       timestamptz
)
language sql stable security definer set search_path = public
as $fn$
  select p.id,
         (select count(*)::int from push_subscriptions s where s.user_id = p.id),
         (select count(*)::int from push_subscriptions s where s.user_id = p.id and s.enabled),
         (select max(s.last_ok_at) from push_subscriptions s where s.user_id = p.id),
         (select s.last_error from push_subscriptions s
           where s.user_id = p.id and s.last_error_at is not null
           order by s.last_error_at desc limit 1),
         (select max(s.last_error_at) from push_subscriptions s where s.user_id = p.id),
         (select max(d.seen_at) from notification_deliveries d where d.user_id = p.id),
         (select max(d.created_at) from notification_deliveries d
           where d.user_id = p.id and d.status = 'failed' and d.last_error = 'no_subscription')
    from profiles p
   where p.company_id = auth_company_id()
     and p.is_active
     and p.role <> 'tv'
     and auth_role() in ('director', 'secretary');
$fn$;

revoke execute on function push_health() from public, anon;
grant execute on function push_health() to authenticated, service_role;
