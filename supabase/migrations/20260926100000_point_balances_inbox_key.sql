-- Perf audit (D-126): balances are summed where the rows are, and the voice inbox gets
-- the key its idempotency always assumed.

-- ---------------------------------------------------------------------------
-- point_balances -- SUM(point_transactions) per person, computed by the database
-- ---------------------------------------------------------------------------
-- The phone used to download the ledger and add it up: the profile, the person's card and
-- the rating sheet summed the last 50 rows, every other screen the first 1000 (PostgREST
-- max_rows), so a balance went wrong without an error once a person had that many rows
-- (принцип 4). The view keeps «balance = SUM, never a column»: nothing is stored.
-- security_invoker: it reads point_transactions under the caller's RLS — a person sees their
-- own line, the director everybody's, anon and the kiosk nothing.
create view point_balances with (security_invoker = true) as
select
  company_id,
  user_id,
  sum(amount)::bigint as balance,
  -- carried off to the shop and not returned: holds minus releases
  coalesce(-sum(amount) filter (where source in ('shop_hold', 'shop_release')), 0)::bigint as spent,
  -- handed out over the last 30 days, shop returns excluded
  coalesce(sum(amount) filter (
    where amount > 0
      and source not in ('shop_hold', 'shop_release')
      and created_at >= now() - interval '30 days'
  ), 0)::bigint as earned_30d
from point_transactions
group by company_id, user_id;

comment on view point_balances is 'Balance = SUM(point_transactions.amount) per person (принцип 4); security_invoker, reads under the caller''s RLS';

revoke all on point_balances from public, anon;
grant select on point_balances to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- inbox_items -- one staging row per capture
-- ---------------------------------------------------------------------------
-- upload-url found the row by (company_id, client_request_id) with no index behind it — a scan
-- per voice command, and transcribe and parse update by the same pair — and inserted after a
-- miss, so two quick retries of one capture could both insert. The unique key makes each lookup
-- an index probe and the second insert a conflict the route answers with the existing row.
-- NULL keys stay allowed and never collide. Rows that already share a key (only that race could
-- make them) keep their data; the later ones give the key up.
update inbox_items i
   set client_request_id = null
  from (
    select id, row_number() over (partition by company_id, client_request_id order by created_at, id) as rn
      from inbox_items
     where client_request_id is not null
  ) d
 where i.id = d.id
   and d.rn > 1;

create unique index inbox_items_company_request_key on inbox_items (company_id, client_request_id);
