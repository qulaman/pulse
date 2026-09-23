-- D-97: «спасибо» директора секретарю за закрытую заявку.
--
-- Реакция, а не статус: автомат заявки (D-79 §1) не меняется. Одна колонка и одна функция:
-- поблагодарить может только тот, кто просил, и только за «Готово»; второе «спасибо» ничего
-- не меняет (время первого остаётся). Пуша нет — сердечки видит секретарь на своём экране
-- по Realtime; кнопку директору показывает UI после гейта адаптации (D-40, флаг points_enabled).

alter table errands add column thanked_at timestamptz;

comment on column errands.thanked_at is 'when the director said «спасибо» for a done errand (D-97); a reaction, not a status';

create or replace function thank_errand(
  p_id uuid,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;      -- the parameter shadows a column name
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_result  jsonb;
  v_row     errands%rowtype;
  v_new     errands%rowtype;
begin
  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;

    if not found then
      select b.result into v_result
        from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  select * into v_row from errands e
   where e.id = p_id and e.company_id = v_company
   for update;
  if v_row.id is null or v_row.author_id is distinct from v_user then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_row.status <> 'done' then
    raise exception 'bad_transition' using errcode = 'P0001';
  end if;

  update errands e set thanked_at = coalesce(e.thanked_at, now())
   where e.id = p_id
  returning * into v_new;

  v_result := to_jsonb(v_new);

  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;

  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

revoke execute on function thank_errand(uuid, uuid) from public, anon;
grant execute on function thank_errand(uuid, uuid) to authenticated, service_role;
