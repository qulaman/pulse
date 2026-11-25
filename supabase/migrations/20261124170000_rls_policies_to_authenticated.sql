-- Row-level security policies name the role they serve: every policy on a public table is for a
-- signed-in user (authenticated). Nobody reads or writes these tables without a session — the
-- sign-in screen, the company's own sign-in address and the code sign-in read through the server.
-- Only the role changes: ALTER POLICY … TO without USING / WITH CHECK keeps the expressions in force.
-- voice_kept_select already names its role; so do the storage policies.

alter policy ai_logs_select on public.ai_logs to authenticated;

alter policy announcement_acks_insert on public.announcement_acks to authenticated;
alter policy announcement_acks_select on public.announcement_acks to authenticated;

alter policy announcements_delete on public.announcements to authenticated;
alter policy announcements_insert on public.announcements to authenticated;
alter policy announcements_select on public.announcements to authenticated;

alter policy companies_select on public.companies to authenticated;

alter policy daily_reports_select on public.daily_reports to authenticated;

alter policy errands_insert on public.errands to authenticated;
alter policy errands_select on public.errands to authenticated;

alter policy ether_events_delete on public.ether_events to authenticated;
alter policy ether_events_select on public.ether_events to authenticated;

alter policy event_participants_select on public.event_participants to authenticated;

alter policy events_select on public.events to authenticated;
alter policy events_update on public.events to authenticated;

alter policy inbox_items_insert on public.inbox_items to authenticated;
alter policy inbox_items_select on public.inbox_items to authenticated;
alter policy inbox_items_update on public.inbox_items to authenticated;

alter policy ingest_batches_select on public.ingest_batches to authenticated;

alter policy mind_boards_delete on public.mind_boards to authenticated;
alter policy mind_boards_insert on public.mind_boards to authenticated;
alter policy mind_boards_select on public.mind_boards to authenticated;
alter policy mind_boards_update on public.mind_boards to authenticated;

alter policy notes_delete on public.notes to authenticated;
alter policy notes_insert on public.notes to authenticated;
alter policy notes_select on public.notes to authenticated;
alter policy notes_update on public.notes to authenticated;

alter policy notification_deliveries_select on public.notification_deliveries to authenticated;

alter policy notification_prefs_select on public.notification_prefs to authenticated;

alter policy orders_select on public.orders to authenticated;

alter policy point_disputes_select on public.point_disputes to authenticated;

alter policy point_transactions_select on public.point_transactions to authenticated;

alter policy profile_phones_select on public.profile_phones to authenticated;
alter policy profile_phones_write on public.profile_phones to authenticated;

alter policy profiles_select on public.profiles to authenticated;
alter policy profiles_update_director on public.profiles to authenticated;
alter policy profiles_update_secretary on public.profiles to authenticated;
alter policy profiles_update_self on public.profiles to authenticated;

alter policy push_subscriptions_delete on public.push_subscriptions to authenticated;
alter policy push_subscriptions_insert on public.push_subscriptions to authenticated;
alter policy push_subscriptions_select on public.push_subscriptions to authenticated;

alter policy recurrence_rules_delete on public.recurrence_rules to authenticated;
alter policy recurrence_rules_insert on public.recurrence_rules to authenticated;
alter policy recurrence_rules_select on public.recurrence_rules to authenticated;
alter policy recurrence_rules_update on public.recurrence_rules to authenticated;

alter policy reminders_select on public.reminders to authenticated;

alter policy shop_items_select on public.shop_items to authenticated;
alter policy shop_items_write on public.shop_items to authenticated;

alter policy task_messages_insert on public.task_messages to authenticated;
alter policy task_messages_select on public.task_messages to authenticated;

alter policy task_reactions_select on public.task_reactions to authenticated;

alter policy task_reads_insert on public.task_reads to authenticated;
alter policy task_reads_select on public.task_reads to authenticated;
alter policy task_reads_update on public.task_reads to authenticated;

alter policy tasks_delete on public.tasks to authenticated;
alter policy tasks_insert on public.tasks to authenticated;
alter policy tasks_select on public.tasks to authenticated;
alter policy tasks_update on public.tasks to authenticated;

alter policy tv_events_select on public.tv_events to authenticated;

alter policy tv_state_select on public.tv_state to authenticated;

alter policy visits_select on public.visits to authenticated;
