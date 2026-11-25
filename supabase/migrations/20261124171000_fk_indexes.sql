-- Indexes for the foreign keys that had none: deleting an inbox item or a shop item looks up the
-- rows that point to it, and without an index that is a scan of the whole table. The inbox links
-- are empty on most rows, so those indexes keep only the rows that have one (as the other
-- optional links do). tv_state has one row per company and needs none.

create index if not exists errands_inbox_item_idx on errands (inbox_item_id) where inbox_item_id is not null;
create index if not exists events_inbox_item_idx on events (inbox_item_id) where inbox_item_id is not null;
create index if not exists notes_inbox_item_idx on notes (inbox_item_id) where inbox_item_id is not null;
create index if not exists orders_item_idx on orders (item_id);
