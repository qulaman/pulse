-- Правки магазина по самопроверке (D-71, тот же день).
-- 1. Тихие часы: предыдущая миграция пересоздала notification_deliveries_deliver_after()
--    от редакции 20260911230000 и потеряла ветку `message` из 20260917130000 — сообщения
--    в треде снова уходили бы ночью. Здесь полное тело: обе прежние ветки плюс магазин.
-- 2. Идемпотентность отмены и выдачи: повтор с тем же client_request_id должен возвращать
--    сохранённый результат, а не падать `wrong_status` — проверка ingest_batches идёт до
--    валидации статуса (оффлайн-очередь DoD).
-- 3. Свой заказ никто не подтверждает и не выдаёт сам себе — даже завхоз.
-- 4. Возврат остатка только если он резервировался (товар мог стать ограниченным после
--    заказа — тогда отмена дарила бы складу единицу).
-- 5. Гранты на функции по конвенции репозитория.

-- ---------------------------------------------------------------------------
-- 1 -- тихие часы целиком
-- ---------------------------------------------------------------------------
create or replace function notification_deliveries_deliver_after() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  -- what reaches an employee's phone waits for the window; the director's own alerts and a
  -- task whose moment the producer already decided (batch / «отправить сейчас» / scheduled
  -- reassign) do not
  if new.event_kind in ('reply', 'rework', 'done', 'revoked', 'deadline_extended', 'announcement',
                        'shop_approved', 'shop_ready', 'shop_cancelled') then
    new.deliver_after := coalesce(next_delivery_slot(new.company_id, now()), now());
  end if;
  -- a message to somebody who is not the task's author is a message to an employee
  if new.event_kind = 'message' and exists (
       select 1 from tasks t where t.id = new.task_id and t.author_id <> new.user_id
     ) then
    new.deliver_after := coalesce(next_delivery_slot(new.company_id, now()), now());
  end if;
  return new;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 4 -- резервировался ли остаток на этом заказе
-- ---------------------------------------------------------------------------
alter table orders add column if not exists stock_reserved boolean not null default false;

comment on column orders.stock_reserved is 'Товар был ограниченным на момент заказа — отмена возвращает единицу только таким';

-- существующие заказы: остаток резервировался, если у товара он есть сейчас
update orders o set stock_reserved = true
  from shop_items s
 where s.id = o.item_id and s.stock is not null and o.status in ('pending', 'approved');

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

  insert into orders (company_id, user_id, item_id, price, stock_reserved)
  values (v_company, v_user, v_item.id, v_item.price, v_item.stock is not null)
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
-- 2 -- отмена: идемпотентность до валидации статуса
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

  -- повтор того же запроса возвращает сохранённый ответ ДО проверки статуса: иначе
  -- доехавшая после сети вторая попытка падала бы `wrong_status` на своей же работе
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

  -- единицу возвращаем только тому товару, у которого её занимали
  if v_order.stock_reserved then
    update shop_items set stock = stock + 1
     where id = v_order.item_id and stock is not null;
  end if;

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
-- 2 + 3 -- выдача: идемпотентность до валидации, свой заказ себе не выдают
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

  select * into v_order from orders
   where id = p_order_id and company_id = v_company
   for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  -- завхоз тоже сотрудник и тоже копит очки: свой заказ он не проводит сам
  if v_order.user_id = v_user then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_status = 'approved' and v_order.status <> 'pending' then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  if p_status = 'delivered' and v_order.status not in ('pending', 'approved') then
    raise exception 'wrong_status' using errcode = 'P0001';
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
-- 5 -- гранты по конвенции: анониму эти функции не нужны
-- ---------------------------------------------------------------------------
revoke execute on function create_shop_order(uuid, uuid) from public, anon;
revoke execute on function cancel_shop_order(uuid, uuid) from public, anon;
revoke execute on function set_shop_order_status(uuid, order_status, uuid) from public, anon;

grant execute on function create_shop_order(uuid, uuid) to authenticated, service_role;
grant execute on function cancel_shop_order(uuid, uuid) to authenticated, service_role;
grant execute on function set_shop_order_status(uuid, order_status, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Баланс на открытом экране: начисление директора — событие point_transactions
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'point_transactions'
  ) then
    alter publication supabase_realtime add table point_transactions;
  end if;
end
$$;
