-- Hard deletes for the director: a wrong or test order goes away without a trace
-- («чистить и удалять ненужные задания», owner, 2026-09-16). Revoke (D-01) stays the
-- normal way to take an order back — the employee keeps the mark; delete is cleanup.
--
-- Children: task_messages and notification_deliveries cascade; point_transactions are
-- append-only (principle 4), so the award stays and only its link to the task is cut;
-- a reassigned clone keeps living with parent_task_id cleared.

create or replace function delete_task(task_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_task    uuid := task_id;
  v_company uuid := auth_company_id();
  v_status  task_status;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select t.status into v_status
    from tasks t
   where t.id = v_task and t.company_id = v_company;

  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;

  update point_transactions p set task_id = null where p.task_id = v_task;
  update tasks t set parent_task_id = null where t.parent_task_id = v_task;
  delete from tasks t where t.id = v_task;

  return jsonb_build_object('deleted', 1, 'status', v_status);
end;
$fn$;

-- «Очистить закрытые»: every done / declined / revoked order of the caller's company.
create or replace function purge_closed_tasks() returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := auth_company_id();
  v_count   int;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  update point_transactions p set task_id = null
   where p.task_id in (select t.id from tasks t where t.company_id = v_company and t.status in ('done','declined','revoked'));
  update tasks t set parent_task_id = null
   where t.parent_task_id in (select c.id from tasks c where c.company_id = v_company and c.status in ('done','declined','revoked'));

  with gone as (
    delete from tasks t
     where t.company_id = v_company and t.status in ('done','declined','revoked')
    returning t.id
  )
  select count(*) into v_count from gone;

  return jsonb_build_object('deleted', v_count);
end;
$fn$;

grant execute on function delete_task(uuid)     to authenticated, service_role;
grant execute on function purge_closed_tasks()  to authenticated, service_role;
