-- D-130, wave 1: how long the director's phrase waited on the phone.
--
-- A phrase is kept on the phone from the release (lib/voice/kept.ts) and reaches the server
-- only when there is network. `recorded_at` is the moment the finger left the face, by the
-- phone's clock; `created_at` is when the upload slot was asked for. The difference is the
-- wait: a few hundred milliseconds live, minutes for a phrase recorded without signal — the
-- pilot's measure of whether the site network costs the director anything, and the first
-- mark of the «voice → card» metric (D-43).
--
--   select count(*) filter (where created_at - recorded_at > interval '1 minute') as kept,
--          count(*) as all_phrases,
--          percentile_cont(0.5) within group (order by extract(epoch from created_at - recorded_at)) as p50_s
--     from inbox_items where recorded_at is not null and created_at > now() - interval '7 days';
--
-- Written by /api/voice/upload-url from the client's `recorded_at`; old rows stay null. The
-- table's policies do not change: the column rides the existing insert (service role).

alter table inbox_items add column if not exists recorded_at timestamptz;

comment on column inbox_items.recorded_at is
  'D-130: when the director released the face, by the phone''s clock; created_at - recorded_at = how long the phrase waited on the phone';
