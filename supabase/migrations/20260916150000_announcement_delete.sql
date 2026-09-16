-- The director can take an announcement back («сообщения в Эфир нельзя отозвать или
-- удалить», owner, 2026-09-16): a hard delete of the row, acks go with it (cascade).
-- Only the company's director; a client's other roles never delete anything here.

create policy announcements_delete on announcements for delete using (
  company_id = auth_company_id() and auth_role() = 'director'
);
