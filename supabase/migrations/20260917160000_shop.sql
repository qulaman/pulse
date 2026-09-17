-- Магазин поощрений (владелец, 2026-09-17, D-71): сотрудник тратит очки на «ништяки».
-- Схема и правила — docs/DATABASE.md «shop_items / orders»; заморозка очков — hold-final
-- (D-10): заказ пишет shop_hold(−price), отмена — shop_release(+price), выдача не пишет
-- ничего. Баланс всегда = SUM(point_transactions), поля с балансом не существует.

-- ---------------------------------------------------------------------------
-- shop_items -- витрина компании
-- ---------------------------------------------------------------------------
create table shop_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies,
  title       text not null check (length(trim(title)) > 0),
  -- one line under the title: what the person actually gets
  description text,
  -- emoji while the company has no photo of the reward; photo_path wins when set
  icon        text,
  photo_path  text,
  price       int  not null check (price > 0),
  -- null = без ограничения (отгул и премия не кончаются на складе)
  stock       int  check (stock >= 0),
  is_active   boolean not null default true,
  sort        int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column shop_items.stock is 'null = unlimited; 0 = out of stock';

create index shop_items_company_idx on shop_items (company_id, is_active, sort, price);

create trigger trg_shop_items_updated
  before update on shop_items
  for each row execute function moddatetime(updated_at);

alter table shop_items enable row level security;

-- read: the whole company except the tv kiosk; write: director / shopkeeper
create policy shop_items_select on shop_items for select
  using (company_id = auth_company_id() and auth_role() <> 'tv');

create policy shop_items_write on shop_items for all
  using (company_id = auth_company_id() and auth_role() in ('director', 'shopkeeper'))
  with check (company_id = auth_company_id() and auth_role() in ('director', 'shopkeeper'));

-- ---------------------------------------------------------------------------
-- orders -- заказ сотрудника; мутации только через RPC ниже
-- ---------------------------------------------------------------------------
create table orders (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies,
  user_id      uuid not null references profiles,
  item_id      uuid not null references shop_items on delete restrict,
  -- price snapshot: the catalog may be recalibrated, the order keeps what it cost
  price        int  not null check (price > 0),
  status       order_status not null default 'pending',
  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  delivered_at timestamptz,
  updated_at   timestamptz not null default now()
);

create index orders_company_user_idx on orders (company_id, user_id, created_at desc);
create index orders_company_status_idx on orders (company_id, status, created_at);

create trigger trg_orders_updated
  before update on orders
  for each row execute function moddatetime(updated_at);

alter table orders enable row level security;

-- read: own orders + director / shopkeeper; no write policies — RPC only
create policy orders_select on orders for select using (
  company_id = auth_company_id()
  and (user_id = auth.uid() or auth_role() in ('director', 'shopkeeper'))
);

-- ---------------------------------------------------------------------------
-- Страховка принципа 4: холд не может увести баланс в минус даже мимо RPC
-- ---------------------------------------------------------------------------
create or replace function point_transactions_hold_guard() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_balance int;
begin
  if new.source <> 'shop_hold' then
    return null;
  end if;
  select coalesce(sum(amount), 0) into v_balance
    from point_transactions
   where company_id = new.company_id and user_id = new.user_id;
  if v_balance < 0 then
    raise exception 'insufficient_points' using errcode = 'P0001';
  end if;
  return null;
end;
$fn$;

-- a constraint trigger so the check runs after the row is visible to the sum
create constraint trigger trg_point_transactions_hold_guard
  after insert on point_transactions
  deferrable initially immediate
  for each row execute function point_transactions_hold_guard();

-- ---------------------------------------------------------------------------
-- create_shop_order -- заказ: холд очков + резерв товара, атомарно
-- ---------------------------------------------------------------------------
create or replace function create_shop_order(
  p_item_id uuid,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_role    text := auth_role();
  v_item    shop_items%rowtype;
  v_balance int;
  v_order   uuid;
  v_result  jsonb;
begin
  if v_company is null or v_user is null or v_role = 'tv' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- one order at a time per person: the balance check and the hold must not race
  perform pg_advisory_xact_lock(hashtext('points:' || v_user::text));

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

  select * into v_item from shop_items
   where id = p_item_id and company_id = v_company and is_active
   for update;
  if v_item.id is null then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if v_item.stock is not null and v_item.stock <= 0 then
    raise exception 'out_of_stock' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount), 0) into v_balance
    from point_transactions where company_id = v_company and user_id = v_user;
  if v_balance < v_item.price then
    raise exception 'insufficient_points' using errcode = 'P0001';
  end if;

  insert into orders (company_id, user_id, item_id, price)
  values (v_company, v_user, v_item.id, v_item.price)
  returning id into v_order;

  insert into point_transactions (company_id, user_id, amount, reason, source, order_id, actor_id)
  values (v_company, v_user, -v_item.price, 'Заказ: ' || v_item.title, 'shop_hold', v_order, v_user);

  if v_item.stock is not null then
    update shop_items set stock = stock - 1 where id = v_item.id;
  end if;

  -- кто выдаёт, тот и узнаёт: директор и завхоз
  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  select v_company, p.id, 'shop_order',
         jsonb_build_object('title', 'Заказ в магазине',
                            'body', v_item.title,
                            'url', '/shop')
    from profiles p
   where p.company_id = v_company and p.is_active
     and p.role in ('director', 'shopkeeper') and p.id <> v_user;

  v_result := jsonb_build_object('id', v_order, 'balance', v_balance - v_item.price);
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- cancel_shop_order -- возврат очков ровно на сумму холда (D-37)
-- ---------------------------------------------------------------------------
create or replace function cancel_shop_order(
  p_order_id uuid,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_role    text := auth_role();
  v_order   orders%rowtype;
  v_hold    int;
  v_title   text;
  v_result  jsonb;
begin
  if v_company is null or v_user is null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_order from orders
   where id = p_order_id and company_id = v_company
   for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  -- владелец — только пока заказ не подтверждён; завхоз и директор — и после (D-37)
  if v_role in ('director', 'shopkeeper') then
    if v_order.status not in ('pending', 'approved') then
      raise exception 'wrong_status' using errcode = 'P0001';
    end if;
  elsif v_order.user_id = v_user then
    if v_order.status <> 'pending' then
      raise exception 'wrong_status' using errcode = 'P0001';
    end if;
  else
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

  select coalesce(sum(-amount), 0) into v_hold
    from point_transactions
   where order_id = v_order.id and source = 'shop_hold';
  select title into v_title from shop_items where id = v_order.item_id;

  update orders set status = 'cancelled' where id = v_order.id;

  if v_hold > 0 then
    -- unique (order_id, source) keeps a double cancel from paying twice
    insert into point_transactions (company_id, user_id, amount, reason, source, order_id, actor_id)
    values (v_company, v_order.user_id, v_hold, 'Отмена заказа: ' || coalesce(v_title, 'товар'),
            'shop_release', v_order.id, v_user);
  end if;

  update shop_items set stock = stock + 1
   where id = v_order.item_id and stock is not null;

  if v_order.user_id <> v_user then
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    values (v_company, v_order.user_id, 'shop_cancelled',
            jsonb_build_object('title', 'Заказ отменён',
                               'body', coalesce(v_title, 'товар') || ' — очки вернулись',
                               'url', '/shop'));
  end if;

  v_result := jsonb_build_object('id', v_order.id, 'released', v_hold);
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- set_shop_order_status -- завхоз ведёт заказ до выдачи (approve / deliver)
-- ---------------------------------------------------------------------------
create or replace function set_shop_order_status(
  p_order_id uuid,
  p_status order_status,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_order   orders%rowtype;
  v_title   text;
  v_kind    text;
  v_head    text;
  v_result  jsonb;
begin
  if auth_role() not in ('director', 'shopkeeper') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_status not in ('approved', 'delivered') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  select * into v_order from orders
   where id = p_order_id and company_id = v_company
   for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if p_status = 'approved' and v_order.status <> 'pending' then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  if p_status = 'delivered' and v_order.status not in ('pending', 'approved') then
    raise exception 'wrong_status' using errcode = 'P0001';
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

  -- выдача новых транзакций не пишет: холд финален (D-10)
  update orders
     set status = p_status,
         approved_at = case when p_status = 'approved' then now() else approved_at end,
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end
   where id = v_order.id;

  select title into v_title from shop_items where id = v_order.item_id;
  v_kind := case when p_status = 'approved' then 'shop_approved' else 'shop_ready' end;
  v_head := case when p_status = 'approved' then 'Заказ подтверждён' else 'Заказ готов' end;

  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  values (v_company, v_order.user_id, v_kind,
          jsonb_build_object('title', v_head,
                             'body', coalesce(v_title, 'товар'),
                             'url', '/shop'));

  v_result := jsonb_build_object('id', v_order.id, 'status', p_status);
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Тихие часы: что прилетает сотруднику, ждёт окна доставки (D-51)
-- ---------------------------------------------------------------------------
create or replace function notification_deliveries_deliver_after() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if new.event_kind in ('reply', 'rework', 'done', 'revoked', 'deadline_extended', 'announcement',
                        'shop_approved', 'shop_ready', 'shop_cancelled') then
    new.deliver_after := coalesce(next_delivery_slot(new.company_id, now()), now());
  end if;
  return new;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Витрина и заказы живут на экране realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shop_items'
  ) then
    alter publication supabase_realtime add table shop_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table orders;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Стартовая витрина (владелец назвал состав и цены, D-71 = виза по D-13).
-- Продукт клиент-агностичен: это дефолт новой компании, а не список WAG —
-- директор правит цены и состав в самом магазине.
-- ---------------------------------------------------------------------------
insert into shop_items (company_id, title, description, icon, price, stock, sort)
select c.id, v.title, v.description, v.icon, v.price, v.stock, v.sort
  from companies c
 cross join (values
   ('Брендовая куртка',     'Тёплая куртка с логотипом компании',    '🧥',  200, null::int, 10),
   ('Брендовая безрукавка', 'Жилет с логотипом компании',            '🦺',  500, null::int, 20),
   ('День отгула',          'Оплачиваемый выходной по согласованию', '🏖️', 1000, null::int, 30),
   ('Премия 50 000 ₸',      'Разовая премия к зарплате',             '💰', 2000, null::int, 40)
 ) as v(title, description, icon, price, stock, sort)
 where not exists (select 1 from shop_items s where s.company_id = c.id);
