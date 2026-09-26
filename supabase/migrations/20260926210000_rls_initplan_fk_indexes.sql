-- Perf audit (D-126): RLS helpers once per statement, and the indexes the code and the
-- foreign keys were missing. No behaviour changes — the same predicates, evaluated cheaper.

-- ---------------------------------------------------------------------------
-- RLS: auth_company_id() / auth_role() / auth.uid() as init plans
-- ---------------------------------------------------------------------------
-- Called bare in a policy, a function runs once per row the policy looks at; wrapped as
-- (SELECT fn()) the planner evaluates it once per statement and can use it in an index
-- condition. auth_company_id() and auth_role() are themselves a profiles lookup, and with one
-- company per database `company_id = auth_company_id()` narrows nothing — a director's read of
-- tasks paid two or three lookups per row of the table. The later migrations (messages_fixes,
-- notes, errands, visits, mind_boards) already wrap them; these are the ones written before.
-- The expressions below are the live definitions (pg_policies) with only the calls wrapped.

alter policy ai_logs_select on public.ai_logs
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text)));

alter policy announcement_acks_insert on public.announcement_acks
  with check (((user_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM announcements a
  WHERE ((a.id = announcement_acks.announcement_id) AND (a.company_id = (SELECT auth_company_id())))))));

alter policy announcement_acks_select on public.announcement_acks
  using ((((SELECT auth_role()) <> 'tv'::text) AND (EXISTS ( SELECT 1
   FROM announcements a
  WHERE ((a.id = announcement_acks.announcement_id) AND (a.company_id = (SELECT auth_company_id())))))));

alter policy announcements_delete on public.announcements
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text)));

alter policy announcements_insert on public.announcements
  with check (((company_id = (SELECT auth_company_id())) AND (author_id = (SELECT auth.uid())) AND ((SELECT auth_role()) = 'director'::text)));

alter policy announcements_select on public.announcements
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) <> 'tv'::text)));

alter policy companies_select on public.companies
  using (((id = (SELECT auth_company_id())) AND ((SELECT auth_role()) <> 'tv'::text)));

alter policy event_participants_select on public.event_participants
  using ((((SELECT auth_role()) <> 'tv'::text) AND can_see_event(event_id)));

alter policy events_select on public.events
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) <> 'tv'::text) AND (((SELECT auth_role()) = 'director'::text) OR (author_id = (SELECT auth.uid())) OR is_event_participant(id))));

alter policy events_update on public.events
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text)))
  with check (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text)));

alter policy inbox_items_insert on public.inbox_items
  with check (((company_id = (SELECT auth_company_id())) AND (user_id = (SELECT auth.uid()))));

alter policy inbox_items_select on public.inbox_items
  using (((company_id = (SELECT auth_company_id())) AND ((user_id = (SELECT auth.uid())) OR ((SELECT auth_role()) = 'director'::text))));

alter policy inbox_items_update on public.inbox_items
  using (((company_id = (SELECT auth_company_id())) AND (user_id = (SELECT auth.uid())) AND (status <> 'confirmed'::inbox_status)))
  with check (((company_id = (SELECT auth_company_id())) AND (user_id = (SELECT auth.uid()))));

alter policy ingest_batches_select on public.ingest_batches
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text)));

alter policy notification_deliveries_select on public.notification_deliveries
  using (((company_id = (SELECT auth_company_id())) AND ((user_id = (SELECT auth.uid())) OR ((SELECT auth_role()) = 'director'::text))));

alter policy notification_prefs_select on public.notification_prefs
  using (((user_id = (SELECT auth.uid())) AND (company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text)));

alter policy orders_select on public.orders
  using (((company_id = (SELECT auth_company_id())) AND ((user_id = (SELECT auth.uid())) OR ((SELECT auth_role()) = ANY (ARRAY['director'::text, 'shopkeeper'::text])))));

alter policy point_transactions_select on public.point_transactions
  using (((company_id = (SELECT auth_company_id())) AND ((user_id = (SELECT auth.uid())) OR ((SELECT auth_role()) = 'director'::text))));

alter policy profiles_select on public.profiles
  using ((((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) <> 'tv'::text)) OR (id = (SELECT auth.uid()))));

alter policy profiles_update_director on public.profiles
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text)))
  with check (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text)));

alter policy profiles_update_secretary on public.profiles
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'secretary'::text) AND (role <> 'director'::user_role)))
  with check (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'secretary'::text) AND (role <> 'director'::user_role)));

alter policy profiles_update_self on public.profiles
  using ((id = (SELECT auth.uid())))
  with check ((id = (SELECT auth.uid())));

alter policy push_subscriptions_delete on public.push_subscriptions
  using (((company_id = (SELECT auth_company_id())) AND (user_id = (SELECT auth.uid()))));

alter policy push_subscriptions_insert on public.push_subscriptions
  with check (((company_id = (SELECT auth_company_id())) AND (user_id = (SELECT auth.uid()))));

alter policy push_subscriptions_select on public.push_subscriptions
  using (((company_id = (SELECT auth_company_id())) AND ((user_id = (SELECT auth.uid())) OR ((SELECT auth_role()) = 'director'::text))));

alter policy recurrence_rules_delete on public.recurrence_rules
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text)));

alter policy recurrence_rules_insert on public.recurrence_rules
  with check (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text) AND (author_id = (SELECT auth.uid()))));

alter policy recurrence_rules_select on public.recurrence_rules
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) <> 'tv'::text)));

alter policy recurrence_rules_update on public.recurrence_rules
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text)))
  with check (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text)));

alter policy reminders_select on public.reminders
  using (((company_id = (SELECT auth_company_id())) AND (user_id = (SELECT auth.uid()))));

alter policy shop_items_select on public.shop_items
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) <> 'tv'::text)));

alter policy shop_items_write on public.shop_items
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = ANY (ARRAY['director'::text, 'shopkeeper'::text]))))
  with check (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = ANY (ARRAY['director'::text, 'shopkeeper'::text]))));

alter policy tasks_delete on public.tasks
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = 'director'::text) AND (status = 'scheduled'::task_status)));

alter policy tasks_insert on public.tasks
  with check (((company_id = (SELECT auth_company_id())) AND (author_id = (SELECT auth.uid())) AND ((SELECT auth_role()) = ANY (ARRAY['director'::text, 'manager'::text]))));

alter policy tasks_select on public.tasks
  using (((company_id = (SELECT auth_company_id())) AND ((status <> 'scheduled'::task_status) OR (author_id = (SELECT auth.uid()))) AND ((assignee_id = (SELECT auth.uid())) OR (author_id = (SELECT auth.uid())) OR ((SELECT auth_role()) = 'director'::text) OR (((SELECT auth_role()) = 'manager'::text) AND (assignee_id IN ( SELECT subordinates((SELECT auth.uid())) AS subordinates))))));

alter policy tasks_update on public.tasks
  using (((company_id = (SELECT auth_company_id())) AND ((status <> 'scheduled'::task_status) OR (author_id = (SELECT auth.uid()))) AND ((assignee_id = (SELECT auth.uid())) OR (author_id = (SELECT auth.uid())) OR ((SELECT auth_role()) = 'director'::text) OR (((SELECT auth_role()) = 'manager'::text) AND (assignee_id IN ( SELECT subordinates((SELECT auth.uid())) AS subordinates))))))
  with check ((company_id = (SELECT auth_company_id())));

alter policy tv_events_select on public.tv_events
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = ANY (ARRAY['tv'::text, 'director'::text]))));

alter policy tv_state_select on public.tv_state
  using (((company_id = (SELECT auth_company_id())) AND ((SELECT auth_role()) = ANY (ARRAY['tv'::text, 'director'::text]))));

-- ---------------------------------------------------------------------------
-- Indexes the reads use
-- ---------------------------------------------------------------------------
-- «Отправленные»: author_id = me order by created_at desc limit 200 (lib/tasks/queries.ts)
create index if not exists tasks_author_created_idx on tasks (author_id, created_at desc);
-- the person's card: their last messages, sender_id = … order by created_at desc limit 20
create index if not exists task_messages_sender_created_idx on task_messages (sender_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Indexes the foreign keys need
-- ---------------------------------------------------------------------------
-- Deleting a parent looks for its children; without an index every deleted row scans the
-- whole child table. The outbox purge deletes up to 2000 deliveries a run against their own
-- digest_id (SET NULL); purge_closed_tasks and «Удалить» delete tasks against tv_events
-- (CASCADE), notes (SET NULL) and subtasks (NO ACTION); deleting an announcement touches notes.
create index if not exists notification_deliveries_digest_id_idx on notification_deliveries (digest_id) where digest_id is not null;
create index if not exists tv_events_task_idx on tv_events (task_id) where task_id is not null;
create index if not exists notes_converted_task_idx on notes (converted_task_id) where converted_task_id is not null;
create index if not exists notes_converted_announcement_idx on notes (converted_announcement_id) where converted_announcement_id is not null;
create index if not exists tasks_parent_task_idx on tasks (parent_task_id) where parent_task_id is not null;
