# Указатель схемы

Этот файл собран скриптом из `supabase/migrations/` — руками не править. Пересобрать: `pnpm db:index`.

Зачем он нужен. Схема базы — результат всех миграций по порядку. Функция при каждой правке записывается целиком заново, поэтому одно имя встречается в нескольких файлах, а действует только последнее определение. Указатель говорит, где оно лежит. Перед правкой функции открой файл из столбца «Действует» и копируй тело оттуда, а не из первого найденного поиском.

Миграций — 78, строк — 21648. Функций — 208, их определений — 314; устаревших тел — 7738 строк (36 % текста миграций).

## Функции

| Функция | Действует | Определений |
|---|---|---|
| `announce_visit` | `20260924180000_visit_messages.sql:129` | 2 |
| `answer_deadline_request` | `20260926120000_task_lifecycle.sql:311` | 1 |
| `answer_visit` | `20260924180000_visit_messages.sql:177` | 2 |
| `auth_company_id` | `20261014180000_login_sessions.sql:36` | 2 |
| `auth_role` | `20261014180000_login_sessions.sql:40` | 2 |
| `auth_session_live` | `20261014180000_login_sessions.sql:29` | 1 |
| `award_points` | `20261103094500_rpc_guards.sql:354` | 3 |
| `can_see_event` | `20260918150000_calendar_events.sql:89` | 1 |
| `cancel_shop_order` | `20260917170000_shop_fixes.sql:132` | 2 |
| `claim_deliveries` | `20260924150200_notify_prefs.sql:352` | 2 |
| `close_time_requests` | `20260926120000_task_lifecycle.sql:201` | 1 |
| `close_visit` | `20260923230100_visits.sql:254` | 1 |
| `confirm_voice_batch` | `20261103094500_rpc_guards.sql:13` | 8 |
| `create_shop_order` | `20260917170000_shop_fixes.sql:49` | 2 |
| `daily_report_checked_on` | `20261028120000_daily_reports.sql:55` | 1 |
| `daily_report_clock` | `20261028120000_daily_reports.sql:35` | 1 |
| `daily_report_holiday` | `20261103120000_daily_report_soft_start.sql:28` | 1 |
| `daily_report_json` | `20261103120000_daily_report_soft_start.sql:248` | 2 |
| `daily_report_on` | `20261028120000_daily_reports.sql:19` | 1 |
| `daily_report_refund_early_fines` | `20261103120000_daily_report_soft_start.sql:549` | 1 |
| `daily_report_reminders_due` | `20261028120000_daily_reports.sql:767` | 1 |
| `daily_report_started_on` | `20261028120000_daily_reports.sql:44` | 1 |
| `daily_report_state` | `20261028120000_daily_reports.sql:167` | 1 |
| `daily_report_tasks` | `20261028120000_daily_reports.sql:117` | 1 |
| `daily_report_workday` | `20261103120000_daily_report_soft_start.sql:38` | 2 |
| `daily_reports_due_missed` | `20261103120000_daily_report_soft_start.sql:458` | 2 |
| `deadline_reminders_due` | `20260926120000_task_lifecycle.sql:885` | 1 |
| `delete_event` | `20260923200000_calendar_edit_delete.sql:191` | 1 |
| `delete_task` | `20260916120000_delete_tasks.sql:9` | 1 |
| `delivery_category` | `20261014120000_points_game.sql:783` | 3 |
| `director_busy` | `20261104121000_director_busy.sql:13` | 1 |
| `director_day_summaries_due` | `20260924160000_push_followups.sql:258` | 2 |
| `director_digest_slot` | `20260924150200_notify_prefs.sql:206` | 1 |
| `director_digests_due` | `20260924160000_push_followups.sql:173` | 2 |
| `director_meeting_until` | `20260924150200_notify_prefs.sql:193` | 1 |
| `director_quiet_until` | `20260924150200_notify_prefs.sql:143` | 1 |
| `dispute_points` | `20261103120000_daily_report_soft_start.sql:592` | 2 |
| `drop_announcement_pushes` | `20260924150000_push_foundation.sql:154` | 1 |
| `edit_event` | `20260923200000_calendar_edit_delete.sql:108` | 1 |
| `errand_answer` | `20260923235000_secretary_link.sql:172` | 1 |
| `errand_ask` | `20260923235000_secretary_link.sql:126` | 1 |
| `errand_eta` | `20260923235000_secretary_link.sql:95` | 1 |
| `errand_nudge` | `20260923235000_secretary_link.sql:262` | 1 |
| `errand_recipients` | `20260923235000_secretary_link.sql:40` | 1 |
| `errand_remember` | `20260923235000_secretary_link.sql:80` | 1 |
| `errand_replay` | `20260923235000_secretary_link.sql:58` | 1 |
| `errand_result` | `20260923235000_secretary_link.sql:219` | 1 |
| `errands_due_escalation` | `20260923235000_secretary_link.sql:388` | 2 |
| `errands_due_remind` | `20260924096000_errand_due.sql:112` | 1 |
| `errands_expire` | `20260923235000_secretary_link.sql:439` | 1 |
| `ether_events_merch` | `20261014120000_points_game.sql:546` | 1 |
| `ether_events_praise` | `20261014120000_points_game.sql:521` | 1 |
| `event_release` | `20260923200000_calendar_edit_delete.sql:68` | 1 |
| `events_due_reminders` | `20260918150000_calendar_events.sql:656` | 1 |
| `events_reset_reminder` | `20260918150000_calendar_events.sql:216` | 1 |
| `extend_task_deadline` | `20260926120000_task_lifecycle.sql:418` | 2 |
| `fn_rating` | `20260922120100_errands.sql:44` | 2 |
| `is_event_participant` | `20260918150000_calendar_events.sql:80` | 1 |
| `issue_login_code` | `20261104130000_ops_console.sql:1510` | 2 |
| `mark_thread_read` | `20260917130000_message_deliveries.sql:136` | 2 |
| `mind_board_branch_cascade` | `20260925150000_mind_board_v2.sql:104` | 1 |
| `mind_board_branch_follow` | `20261020120000_mind_board_v3.sql:49` | 1 |
| `mind_board_branch_guard` | `20260925150000_mind_board_v2.sql:41` | 1 |
| `mind_board_copy` | `20261021100000_board_sketch.sql:213` | 2 |
| `mind_board_point_changed` | `20260924090000_mind_boards.sql:396` | 1 |
| `mind_board_touch_tv` | `20261021150000_board_live_week.sql:232` | 2 |
| `my_daily_report` | `20261103120000_daily_report_soft_start.sql:51` | 2 |
| `my_daily_report_history` | `20261028120000_daily_reports.sql:379` | 1 |
| `next_delivery_slot` | `20260911220000_reassign_window_reply_dedupe.sql:10` | 1 |
| `notes_due_reminders` | `20260923205000_notes_reminders_trash.sql:52` | 1 |
| `notes_purge_trash` | `20260924090000_mind_boards.sql:442` | 2 |
| `notes_reset_reminder` | `20260923205000_notes_reminders_trash.sql:30` | 1 |
| `notification_deliveries_deliver_after` | `20261104130000_ops_console.sql:1572` | 8 |
| `notification_deliveries_purge` | `20260924160000_push_followups.sql:320` | 1 |
| `notify_hhmm` | `20260924150200_notify_prefs.sql:100` | 1 |
| `notify_outbox_announcement` | `20260924150000_push_foundation.sql:137` | 2 |
| `notify_outbox_errand` | `20260925200000_push_words.sql:122` | 4 |
| `notify_outbox_event` | `20260923201000_calendar_queued_refresh.sql:14` | 3 |
| `notify_outbox_event_participant` | `20261022120000_recurrence_live.sql:434` | 2 |
| `notify_outbox_message` | `20260926120000_task_lifecycle.sql:742` | 2 |
| `notify_outbox_task` | `20260925200000_push_words.sql:48` | 4 |
| `notify_outbox_visit` | `20260925200000_push_words.sql:215` | 3 |
| `notify_prefs_defaults` | `20260924160000_push_followups.sql:21` | 2 |
| `notify_prefs_of` | `20260924150200_notify_prefs.sql:86` | 1 |
| `nudge_task` | `20260926120000_task_lifecycle.sql:519` | 1 |
| `ops_add_person` | `20261104130000_ops_console.sql:755` | 1 |
| `ops_adjust_points` | `20261104130000_ops_console.sql:912` | 1 |
| `ops_audit_list` | `20261104130000_ops_console.sql:604` | 1 |
| `ops_change_director` | `20261104130000_ops_console.sql:941` | 1 |
| `ops_companies` | `20261104130000_ops_console.sql:446` | 1 |
| `ops_company_card` | `20261104130000_ops_console.sql:490` | 1 |
| `ops_company_footprint` | `20261104130000_ops_console.sql:567` | 1 |
| `ops_create_company` | `20261104130000_ops_console.sql:693` | 1 |
| `ops_delete_task` | `20261104130000_ops_console.sql:1133` | 1 |
| `ops_export_begin` | `20261104130000_ops_console.sql:1288` | 1 |
| `ops_export_files` | `20261104130000_ops_console.sql:1341` | 1 |
| `ops_export_finish` | `20261104130000_ops_console.sql:1366` | 1 |
| `ops_export_page` | `20261104130000_ops_console.sql:1310` | 1 |
| `ops_grant_operator` | `20261104130000_ops_console.sql:1409` | 1 |
| `ops_log_action` | `20261104130000_ops_console.sql:744` | 1 |
| `ops_login_state` | `20261104130000_ops_console.sql:361` | 1 |
| `ops_operators` | `20261104130000_ops_console.sql:633` | 1 |
| `ops_prepare_company` | `20261104130000_ops_console.sql:668` | 1 |
| `ops_purge_company` | `20261104130000_ops_console.sql:1224` | 1 |
| `ops_revoke_operator` | `20261104130000_ops_console.sql:1433` | 1 |
| `ops_revoke_sessions` | `20261104130000_ops_console.sql:881` | 1 |
| `ops_slug_free` | `20261104130000_ops_console.sql:662` | 1 |
| `ops_storage_done` | `20261104130000_ops_console.sql:1393` | 1 |
| `ops_storage_left` | `20261104130000_ops_console.sql:1400` | 1 |
| `ops_storage_next` | `20261104130000_ops_console.sql:1382` | 1 |
| `ops_task_get` | `20261104130000_ops_console.sql:1082` | 1 |
| `ops_ticket` | `20261104130000_ops_console.sql:370` | 1 |
| `ops_update_company` | `20261104130000_ops_console.sql:786` | 1 |
| `ops_update_person` | `20261104130000_ops_console.sql:827` | 1 |
| `ops_update_task` | `20261104130000_ops_console.sql:1102` | 1 |
| `ops_wipe_activity` | `20261104130000_ops_console.sql:1165` | 1 |
| `ops.assert` | `20261104130000_ops_console.sql:120` | 1 |
| `ops.audit_frozen` | `20261104130000_ops_console.sql:103` | 1 |
| `ops.clear_rows` | `20261104130000_ops_console.sql:275` | 1 |
| `ops.export_company` | `20261104130000_ops_console.sql:340` | 1 |
| `ops.export_tables` | `20261104130000_ops_console.sql:327` | 1 |
| `ops.log` | `20261104130000_ops_console.sql:185` | 1 |
| `ops.queue_files` | `20261104130000_ops_console.sql:290` | 1 |
| `ops.rows_taken` | `20261104130000_ops_console.sql:267` | 1 |
| `ops.signals` | `20261104130000_ops_console.sql:202` | 1 |
| `ops.table_counts` | `20261104130000_ops_console.sql:229` | 1 |
| `ops.take` | `20261104130000_ops_console.sql:159` | 1 |
| `ops.task_json` | `20261104130000_ops_console.sql:312` | 1 |
| `overdue_alerts_due` | `20260926120000_task_lifecycle.sql:842` | 2 |
| `point_transactions_hold_guard` | `20260917160000_shop.sql:80` | 1 |
| `points_rule` | `20261014120000_points_game.sql:22` | 1 |
| `profiles_guard` | `20261104120000_person_contact.sql:65` | 4 |
| `profiles_on_deactivate` | `20261014180000_login_sessions.sql:108` | 1 |
| `publish_due_scheduled` | `20260924150000_push_foundation.sql:23` | 1 |
| `purge_closed_tasks` | `20260916120000_delete_tasks.sql:38` | 1 |
| `push_health` | `20260924150100_push_health.sql:22` | 1 |
| `push_when` | `20260925200000_push_words.sql:23` | 1 |
| `react_to_task` | `20261014120000_points_game.sql:209` | 1 |
| `reaction_glyph` | `20261014120000_points_game.sql:42` | 1 |
| `reaction_points` | `20261014120000_points_game.sql:33` | 1 |
| `reassign_task` | `20260926120000_task_lifecycle.sql:630` | 3 |
| `recurrence_falls_on` | `20261022120000_recurrence_live.sql:81` | 1 |
| `recurrence_in_phase` | `20261022120000_recurrence_live.sql:95` | 1 |
| `recurrence_next_on` | `20261022120000_recurrence_live.sql:112` | 1 |
| `recurrence_rules_schedule` | `20261022120000_recurrence_live.sql:155` | 1 |
| `recurrence_run_at` | `20261022120000_recurrence_live.sql:130` | 1 |
| `recurrence_spawn` | `20261022120000_recurrence_live.sql:324` | 1 |
| `redeem_login_code` | `20261014150000_login_codes.sql:152` | 1 |
| `release_login_code` | `20261014150000_login_codes.sql:202` | 1 |
| `request_deadline` | `20260926120000_task_lifecycle.sql:225` | 1 |
| `resolve_points_dispute` | `20261014120000_points_game.sql:415` | 1 |
| `respond_event` | `20260924150000_push_foundation.sql:176` | 2 |
| `revoke_sessions` | `20261014180000_login_sessions.sql:56` | 1 |
| `revoke_task` | `20260910100100_task_rpc.sql:137` | 1 |
| `ru_plural` | `20260924150300_director_signals.sql:16` | 1 |
| `send_announcements_now` | `20260926140000_send_now.sql:156` | 1 |
| `send_task_now` | `20260926140000_send_now.sql:81` | 1 |
| `set_event_participants` | `20260918150000_calendar_events.sql:616` | 1 |
| `set_notify_prefs` | `20260924150200_notify_prefs.sql:375` | 1 |
| `set_shop_order_status` | `20260917170000_shop_fixes.sql:225` | 2 |
| `submit_daily_report` | `20261103120000_daily_report_soft_start.sql:122` | 2 |
| `subordinates` | `20260907120000_foundation.sql:73` | 1 |
| `task_question_answered` | `20260926120000_task_lifecycle.sql:599` | 2 |
| `task_sent_at` | `20261014120000_points_game.sql:61` | 1 |
| `task_status_guard` | `20260926140000_send_now.sql:23` | 5 |
| `task_status_message` | `20260907120100_tasks_and_messages.sql:125` | 1 |
| `task_streak_of` | `20261014120000_points_game.sql:74` | 1 |
| `tasks_board_touch_tv` | `20261021150000_board_live_week.sql:253` | 1 |
| `tasks_field_guard` | `20261022120000_recurrence_live.sql:278` | 3 |
| `tasks_points` | `20261014120000_points_game.sql:93` | 1 |
| `team_channel_alerts_due` | `20260924160000_push_followups.sql:124` | 1 |
| `team_daily_report_day` | `20261028120000_daily_reports.sql:407` | 1 |
| `team_daily_report_period` | `20261103120000_daily_report_soft_start.sql:273` | 2 |
| `team_role` | `20260922120100_errands.sql:36` | 1 |
| `thank_errand` | `20260923210000_errand_thanks.sql:12` | 1 |
| `transition_errand` | `20260922120100_errands.sql:409` | 1 |
| `transition_task` | `20260930120000_rework_handover_one_call.sql:12` | 4 |
| `tv_board` | `20261021150000_board_live_week.sql:106` | 4 |
| `tv_board_cap` | `20261020120000_mind_board_v3.sql:25` | 1 |
| `tv_board_control` | `20261021100000_board_sketch.sql:136` | 3 |
| `tv_calendar` | `20260923233000_tv_calendar_month.sql:147` | 2 |
| `tv_control` | `20261020120000_mind_board_v3.sql:149` | 7 |
| `tv_emit` | `20260917190000_tv_events.sql:57` | 1 |
| `tv_events_announcement` | `20260917190000_tv_events.sql:131` | 1 |
| `tv_events_order` | `20260917190000_tv_events.sql:144` | 1 |
| `tv_events_points` | `20261014120000_points_game.sql:578` | 2 |
| `tv_events_prune` | `20260917190000_tv_events.sql:168` | 1 |
| `tv_events_task` | `20260917190000_tv_events.sql:84` | 1 |
| `tv_focus` | `20260925180000_tv_wall_v4.sql:357` | 4 |
| `tv_guest_on` | `20260923230000_tv_wall_v2.sql:59` | 1 |
| `tv_heartbeat` | `20260923230100_visits.sql:366` | 2 |
| `tv_overlay` | `20260924180000_visit_messages.sql:249` | 2 |
| `tv_rating` | `20261103120000_daily_report_soft_start.sql:669` | 3 |
| `tv_stage` | `20261021150000_board_live_week.sql:38` | 1 |
| `tv_state_board_point_reset` | `20260925150000_mind_board_v2.sql:137` | 1 |
| `tv_summary` | `20260922120100_errands.sql:110` | 5 |
| `tv_task_story` | `20260925120000_tv_focus_story.sql:30` | 1 |
| `tv_touch` | `20260923230100_visits.sql:87` | 1 |
| `tv_week_board` | `20261021150000_board_live_week.sql:60` | 1 |
| `tv_week_end` | `20261021150000_board_live_week.sql:27` | 1 |
| `unseen_task_alerts_due` | `20260924160000_push_followups.sql:73` | 2 |
| `update_company_profile` | `20260924100000_secretary_admin.sql:29` | 2 |
| `update_company_settings` | `20261104122000_dev_tools_flag.sql:13` | 3 |
| `visits_due_expiry` | `20260924180000_visit_messages.sql:220` | 2 |
| `voice_keep` | `20261103121000_voice_retention.sql:65` | 1 |
| `voice_mark_purged` | `20261103121000_voice_retention.sql:166` | 1 |
| `voice_purge_due` | `20261103121000_voice_retention.sql:93` | 1 |
| `voice_retention_days` | `20261103121000_voice_retention.sql:24` | 1 |

Удалены и больше не существуют:

- `notify_outbox_question` — удалена в `20260917130000_message_deliveries.sql:20`
- `notify_outbox_reply` — удалена в `20260917130000_message_deliveries.sql:21`

## Таблицы

| Таблица | Создана | Менялась в |
|---|---|---|
| `ai_logs` | `20260910100000_voice_pipeline.sql:23` | — |
| `announcement_acks` | `20260910100000_voice_pipeline.sql:86` | — |
| `announcements` | `20260910100000_voice_pipeline.sql:77` | — |
| `companies` | `20260907120000_foundation.sql:26` | `20261014150000` |
| `daily_reports` | `20261028120000_daily_reports.sql:65` | `20261103120000` |
| `errands` | `20260922120100_errands.sql:258` | `20260923210000`, `20260923235000`, `20260924096000` |
| `ether_events` | `20261014120000_points_game.sql:489` | — |
| `event_participants` | `20260918150000_calendar_events.sql:54` | — |
| `events` | `20260918150000_calendar_events.sql:32` | `20261022120000` |
| `inbox_items` | `20260910100000_voice_pipeline.sql:55` | `20260930130000` |
| `ingest_batches` | `20260910100000_voice_pipeline.sql:8` | — |
| `login_attempts` | `20261014150000_login_codes.sql:58` | — |
| `login_codes` | `20261014150000_login_codes.sql:26` | `20261104130000` |
| `mind_boards` | `20260924090000_mind_boards.sql:29` | `20261020120000` |
| `notes` | `20260917200000_notes.sql:20` | `20260923205000`, `20260924090000`, `20260925150000`, `20261021100000` |
| `notification_deliveries` | `20260910180000_delivery_outbox.sql:35` | `20260911230000`, `20260924150000`, `20260924150200` |
| `notification_prefs` | `20260924150200_notify_prefs.sql:52` | — |
| `ops.audit` | `20261104130000_ops_console.sql:46` | — |
| `ops.company_requests` | `20261104130000_ops_console.sql:62` | — |
| `ops.exports` | `20261104130000_ops_console.sql:80` | — |
| `ops.operators` | `20261104130000_ops_console.sql:24` | — |
| `ops.storage_queue` | `20261104130000_ops_console.sql:70` | — |
| `ops.tickets` | `20261104130000_ops_console.sql:31` | — |
| `orders` | `20260917160000_shop.sql:48` | `20260917170000` |
| `point_disputes` | `20261014120000_points_game.sql:321` | — |
| `point_transactions` | `20260910140000_points_and_settings.sql:8` | `20261014120000`, `20261028120000` |
| `profile_phones` | `20261104120000_person_contact.sql:21` | — |
| `profiles` | `20260907120000_foundation.sql:38` | `20260923235000`, `20261104120000` |
| `push_subscriptions` | `20260910180000_delivery_outbox.sql:8` | `20260924150100` |
| `recurrence_rules` | `20260910100000_voice_pipeline.sql:96` | `20261022120000` |
| `reminders` | `20260910100000_voice_pipeline.sql:111` | — |
| `shop_items` | `20260917160000_shop.sql:9` | — |
| `task_messages` | `20260907120100_tasks_and_messages.sql:39` | — |
| `task_reactions` | `20261014120000_points_game.sql:182` | — |
| `task_reads` | `20260916140000_task_reads.sql:7` | `20260917120000` |
| `tasks` | `20260907120100_tasks_and_messages.sql:6` | `20260910100000`, `20260926120000`, `20261022120000` |
| `tv_events` | `20260917190000_tv_events.sql:16` | — |
| `tv_state` | `20260918100000_tv_state.sql:26` | `20260923230000`, `20260923233000`, `20260924090000`, `20260924095000`, `20260925150000`, `20260925180000`, `20261021150000` |
| `visits` | `20260923230100_visits.sql:34` | `20260924180000` |
| `voice_kept` | `20261103121000_voice_retention.sql:46` | — |

## Политики RLS

| Таблица и политика | Действует | Правок |
|---|---|---|
| `ai_logs.ai_logs_select` | `20260926210000_rls_initplan_fk_indexes.sql:15` | 2 |
| `announcement_acks.announcement_acks_insert` | `20260926210000_rls_initplan_fk_indexes.sql:18` | 2 |
| `announcement_acks.announcement_acks_select` | `20260926210000_rls_initplan_fk_indexes.sql:23` | 2 |
| `announcements.announcements_delete` | `20260926210000_rls_initplan_fk_indexes.sql:28` | 2 |
| `announcements.announcements_insert` | `20260926210000_rls_initplan_fk_indexes.sql:31` | 2 |
| `announcements.announcements_select` | `20260926210000_rls_initplan_fk_indexes.sql:34` | 2 |
| `companies.companies_select` | `20260926210000_rls_initplan_fk_indexes.sql:37` | 3 |
| `daily_reports.daily_reports_select` | `20261028120000_daily_reports.sql:98` | 1 |
| `errands.errands_insert` | `20260922120100_errands.sql:306` | 1 |
| `errands.errands_select` | `20260922120100_errands.sql:301` | 1 |
| `ether_events.ether_events_delete` | `20261014120000_points_game.sql:517` | 1 |
| `ether_events.ether_events_select` | `20261014120000_points_game.sql:513` | 1 |
| `event_participants.event_participants_select` | `20260926210000_rls_initplan_fk_indexes.sql:40` | 2 |
| `events.events_select` | `20260926210000_rls_initplan_fk_indexes.sql:43` | 2 |
| `events.events_update` | `20260926210000_rls_initplan_fk_indexes.sql:46` | 2 |
| `inbox_items.inbox_items_insert` | `20260926210000_rls_initplan_fk_indexes.sql:50` | 2 |
| `inbox_items.inbox_items_select` | `20260926210000_rls_initplan_fk_indexes.sql:53` | 2 |
| `inbox_items.inbox_items_update` | `20260926210000_rls_initplan_fk_indexes.sql:56` | 2 |
| `ingest_batches.ingest_batches_select` | `20260926210000_rls_initplan_fk_indexes.sql:60` | 2 |
| `mind_boards.mind_boards_delete` | `20260924090000_mind_boards.sql:72` | 1 |
| `mind_boards.mind_boards_insert` | `20260924090000_mind_boards.sql:60` | 1 |
| `mind_boards.mind_boards_select` | `20260924090000_mind_boards.sql:56` | 1 |
| `mind_boards.mind_boards_update` | `20260924090000_mind_boards.sql:64` | 1 |
| `notes.notes_delete` | `20260917200000_notes.sql:69` | 1 |
| `notes.notes_insert` | `20260924090000_mind_boards.sql:104` | 2 |
| `notes.notes_select` | `20260917200000_notes.sql:53` | 1 |
| `notes.notes_update` | `20260924090000_mind_boards.sql:113` | 2 |
| `notification_deliveries.notification_deliveries_select` | `20260926210000_rls_initplan_fk_indexes.sql:63` | 2 |
| `notification_prefs.notification_prefs_select` | `20260926210000_rls_initplan_fk_indexes.sql:66` | 2 |
| `orders.orders_select` | `20260926210000_rls_initplan_fk_indexes.sql:69` | 2 |
| `point_disputes.point_disputes_select` | `20261014120000_points_game.sql:344` | 1 |
| `point_transactions.point_transactions_select` | `20260926210000_rls_initplan_fk_indexes.sql:72` | 2 |
| `profile_phones.profile_phones_select` | `20261104120000_person_contact.sql:36` | 1 |
| `profile_phones.profile_phones_write` | `20261104120000_person_contact.sql:42` | 1 |
| `profiles.profiles_select` | `20261014180000_login_sessions.sql:47` | 4 |
| `profiles.profiles_update_director` | `20260926210000_rls_initplan_fk_indexes.sql:78` | 2 |
| `profiles.profiles_update_secretary` | `20260926210000_rls_initplan_fk_indexes.sql:82` | 2 |
| `profiles.profiles_update_self` | `20260926210000_rls_initplan_fk_indexes.sql:86` | 2 |
| `push_subscriptions.push_subscriptions_delete` | `20260926210000_rls_initplan_fk_indexes.sql:90` | 2 |
| `push_subscriptions.push_subscriptions_insert` | `20260926210000_rls_initplan_fk_indexes.sql:93` | 2 |
| `push_subscriptions.push_subscriptions_select` | `20260926210000_rls_initplan_fk_indexes.sql:96` | 2 |
| `recurrence_rules.recurrence_rules_delete` | `20260926210000_rls_initplan_fk_indexes.sql:99` | 2 |
| `recurrence_rules.recurrence_rules_insert` | `20260926210000_rls_initplan_fk_indexes.sql:102` | 2 |
| `recurrence_rules.recurrence_rules_select` | `20260926210000_rls_initplan_fk_indexes.sql:105` | 2 |
| `recurrence_rules.recurrence_rules_update` | `20260926210000_rls_initplan_fk_indexes.sql:108` | 2 |
| `reminders.reminders_select` | `20260926210000_rls_initplan_fk_indexes.sql:112` | 2 |
| `shop_items.shop_items_select` | `20260926210000_rls_initplan_fk_indexes.sql:115` | 2 |
| `shop_items.shop_items_write` | `20260926210000_rls_initplan_fk_indexes.sql:118` | 2 |
| `storage.objects.avatars_insert_roster` | `20261104120000_person_contact.sql:130` | 1 |
| `storage.objects.brand_public_read` | `20260911090000_company_brand.sql:33` | 1 |
| `storage.objects.photos_insert_own` | `20260910170000_photos_bucket.sql:9` | 1 |
| `storage.objects.photos_select_own` | `20260910170000_photos_bucket.sql:16` | 1 |
| `storage.objects.voice_insert_own` | `20260910100000_voice_pipeline.sql:236` | 1 |
| `storage.objects.voice_select_own` | `20260910100000_voice_pipeline.sql:243` | 1 |
| `task_messages.task_messages_insert` | `20260917120000_messages_fixes.sql:71` | 2 |
| `task_messages.task_messages_select` | `20260917120000_messages_fixes.sql:59` | 2 |
| `task_reactions.task_reactions_select` | `20261014120000_points_game.sql:200` | 1 |
| `task_reads.task_reads_insert` | `20260917120000_messages_fixes.sql:90` | 2 |
| `task_reads.task_reads_select` | `20260917120000_messages_fixes.sql:87` | 2 |
| `task_reads.task_reads_update` | `20260917120000_messages_fixes.sql:95` | 2 |
| `tasks.tasks_delete` | `20260926210000_rls_initplan_fk_indexes.sql:122` | 2 |
| `tasks.tasks_insert` | `20260926210000_rls_initplan_fk_indexes.sql:125` | 2 |
| `tasks.tasks_select` | `20260926210000_rls_initplan_fk_indexes.sql:128` | 2 |
| `tasks.tasks_update` | `20260926210000_rls_initplan_fk_indexes.sql:131` | 2 |
| `tv_events.tv_events_select` | `20260926210000_rls_initplan_fk_indexes.sql:135` | 2 |
| `tv_state.tv_state_select` | `20260926210000_rls_initplan_fk_indexes.sql:138` | 2 |
| `visits.visits_select` | `20260923230100_visits.sql:67` | 1 |
| `voice_kept.voice_kept_select` | `20261103121000_voice_retention.sql:58` | 1 |

## Триггеры

| Триггер | На таблице | Действует |
|---|---|---|
| `audit_frozen` | `ops.audit` | `20261104130000_ops_console.sql:111` |
| `trg_close_time_requests` | `tasks` | `20260926120000_task_lifecycle.sql:218` |
| `trg_daily_reports_updated_at` | `daily_reports` | `20261028120000_daily_reports.sql:90` |
| `trg_drop_announcement_pushes` | `announcements` | `20260924150000_push_foundation.sql:168` |
| `trg_errands_updated_at` | `errands` | `20260922120100_errands.sql:281` |
| `trg_ether_events_merch` | `orders` | `20261014120000_points_game.sql:570` |
| `trg_ether_events_praise` | `point_transactions` | `20261014120000_points_game.sql:542` |
| `trg_events_reset_reminder` | `events` | `20260918150000_calendar_events.sql:227` |
| `trg_events_updated_at` | `events` | `20260918150000_calendar_events.sql:66` |
| `trg_inbox_items_updated_at` | `inbox_items` | `20260910100000_voice_pipeline.sql:70` |
| `trg_mind_boards_touch_tv` | `mind_boards` | `20260924090000_mind_boards.sql:435` |
| `trg_mind_boards_updated_at` | `mind_boards` | `20260924090000_mind_boards.sql:42` |
| `trg_notes_branch_cascade` | `notes` | `20260925150000_mind_board_v2.sql:122` |
| `trg_notes_branch_follow` | `notes` | `20261020120000_mind_board_v3.sql:63` |
| `trg_notes_branch_guard` | `notes` | `20260925150000_mind_board_v2.sql:96` |
| `trg_notes_mind_board` | `notes` | `20260924090000_mind_boards.sql:417` |
| `trg_notes_reset_reminder` | `notes` | `20260923205000_notes_reminders_trash.sql:41` |
| `trg_notes_updated_at` | `notes` | `20260917200000_notes.sql:40` |
| `trg_notification_deliveries_deliver_after` | `notification_deliveries` | `20260911230000_deliver_after.sql:29` |
| `trg_notify_outbox_announcements` | `announcements` | `20260910180000_delivery_outbox.sql:141` |
| `trg_notify_outbox_errand` | `errands` | `20260922120100_errands.sql:401` |
| `trg_notify_outbox_event` | `events` | `20260918150000_calendar_events.sql:211` |
| `trg_notify_outbox_event_participant` | `event_participants` | `20260918150000_calendar_events.sql:176` |
| `trg_notify_outbox_messages` | `task_messages` | `20260917130000_message_deliveries.sql:110` |
| `trg_notify_outbox_tasks` | `tasks` | `20260910180000_delivery_outbox.sql:97` |
| `trg_notify_outbox_visit` | `visits` | `20260923230100_visits.sql:168` |
| `trg_orders_updated` | `orders` | `20260917160000_shop.sql:65` |
| `trg_point_transactions_hold_guard` | `point_transactions` | `20260917160000_shop.sql:100` |
| `trg_profiles_deactivated` | `profiles` | `20261014180000_login_sessions.sql:122` |
| `trg_profiles_guard` | `profiles` | `20260907120000_foundation.sql:95` |
| `trg_question_answered` | `task_messages` | `20260907120100_tasks_and_messages.sql:180` |
| `trg_recurrence_rules_schedule` | `recurrence_rules` | `20261022120000_recurrence_live.sql:244` |
| `trg_shop_items_updated` | `shop_items` | `20260917160000_shop.sql:31` |
| `trg_task_status_guard` | `tasks` | `20260907120100_tasks_and_messages.sql:117` |
| `trg_task_status_message` | `tasks` | `20260907120100_tasks_and_messages.sql:146` |
| `trg_tasks_board_touch_tv` | `tasks` | `20261021150000_board_live_week.sql:272` |
| `trg_tasks_field_guard` | `tasks` | `20260907150000_guards_and_tv_isolation.sql:96` |
| `trg_tasks_points` | `tasks` | `20261014120000_points_game.sql:169` |
| `trg_tasks_updated_at` | `tasks` | `20260907120100_tasks_and_messages.sql:32` |
| `trg_tv_events_announcement` | `announcements` | `20260917190000_tv_events.sql:140` |
| `trg_tv_events_order` | `orders` | `20260917190000_tv_events.sql:160` |
| `trg_tv_events_points` | `point_transactions` | `20260917190000_tv_events.sql:127` |
| `trg_tv_events_task` | `tasks` | `20260917190000_tv_events.sql:109` |
| `trg_tv_state_board_point` | `tv_state` | `20260925150000_mind_board_v2.sql:149` |
| `trg_tv_state_updated_at` | `tv_state` | `20260918100000_tv_state.sql:48` |
| `trg_visits_updated_at` | `visits` | `20260923230100_visits.sql:54` |

## Перечисления

| Тип | Создан | Значения добавлялись в |
|---|---|---|
| `absence_kind` | `20260907120000_foundation.sql:20` | — |
| `ai_log_kind` | `20260907120000_foundation.sql:18` | — |
| `ai_source` | `20260907120000_foundation.sql:19` | — |
| `availability_t` | `20260907120000_foundation.sql:10` | — |
| `delivery_channel` | `20260907120000_foundation.sql:16` | — |
| `delivery_status` | `20260907120000_foundation.sql:17` | — |
| `errand_status` | `20260922120100_errands.sql:256` | — |
| `inbox_status` | `20260907120000_foundation.sql:21` | — |
| `message_type` | `20260907120000_foundation.sql:13` | — |
| `order_status` | `20260907120000_foundation.sql:15` | — |
| `point_source` | `20260907120000_foundation.sql:14` | — |
| `task_priority` | `20260907120000_foundation.sql:12` | — |
| `task_status` | `20260907120000_foundation.sql:11` | — |
| `user_role` | `20260907120000_foundation.sql:9` | `20260922120000` |

## Миграции, которые пишут строки

Эти миграции не только меняют схему, но и пишут данные. На пустой базе правки существующих строк ничего не делают; вставки в `storage.buckets` создают бакеты и нужны всегда.

| Миграция | Что пишет |
|---|---|
| `20260910100000_voice_pipeline.sql` | `insert into storage.buckets` |
| `20260910170000_photos_bucket.sql` | `insert into storage.buckets` |
| `20260911090000_company_brand.sql` | `insert into storage.buckets` |
| `20260917160000_shop.sql` | `insert into shop_items` |
| `20260917170000_shop_fixes.sql` | `update orders` |
| `20260923160000_secretary_dnd_guest.sql` | `update companies` |
| `20260923205000_notes_reminders_trash.sql` | `insert into notes` |
| `20260923235000_secretary_link.sql` | `update companies` |
| `20260926200000_point_balances_inbox_key.sql` | `update inbox_items` |
| `20261014120000_points_game.sql` | `update profiles` |
| `20261022120000_recurrence_live.sql` | `update recurrence_rules` |
| `20261104120000_person_contact.sql` | `insert into storage.buckets` |
| `20261104122000_dev_tools_flag.sql` | `update companies` |
