-- set_event_participants goes (cleanup 033, the owner's call): nothing calls it — the guest list of
-- a meeting is changed by edit_event (20260923200000_calendar_edit_delete.sql), which also tells the
-- people who joined and who left. Defined in 20260918150000_calendar_events.sql:616.

revoke execute on function public.set_event_participants(uuid, uuid[], uuid[]) from public, anon, authenticated, service_role;
drop function public.set_event_participants(uuid, uuid[], uuid[]);
