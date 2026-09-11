-- Quiet hours as data, not as a list in the worker (D-51 §2, принцип 8): every outbox row
-- carries the moment it may leave. The trigger sets it from the company's delivery window
-- for the kinds an employee should not hear at night; everything else leaves at once.
-- The worker only asks «deliver_after <= now()» — no kind list, no starvation of the
-- batch window by rows that are waiting for the morning.

alter table notification_deliveries
  add column if not exists deliver_after timestamptz not null default now();

create index if not exists notification_deliveries_due_idx
  on notification_deliveries (status, channel, deliver_after)
  where status = 'queued';

create or replace function notification_deliveries_deliver_after() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  -- what reaches an employee's phone waits for the window; the director's own alerts and a
  -- task whose moment the producer already decided (batch / «отправить сейчас» / scheduled
  -- reassign) do not
  if new.event_kind in ('reply', 'rework', 'done', 'revoked', 'deadline_extended', 'announcement') then
    new.deliver_after := coalesce(next_delivery_slot(new.company_id, now()), now());
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_notification_deliveries_deliver_after on notification_deliveries;
create trigger trg_notification_deliveries_deliver_after
  before insert on notification_deliveries
  for each row execute function notification_deliveries_deliver_after();
