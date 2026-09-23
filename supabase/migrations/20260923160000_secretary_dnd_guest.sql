-- D-87: two new buttons of the secretary catalogue — «Не беспокоить» and «Пригласи гостя».
--
-- A fresh company gets them from the defaults in lib/settings.ts. A company whose catalogue
-- was saved before them (the settings form writes the whole list) would never see them, so
-- they are appended here: only where the code is missing, at the end of the director's own
-- order, and only while the catalogue stays within its twelve buttons (SecretaryActionsSchema).
-- Data only: no schema, no policies.

with fresh(code, action) as (
  values
    ('dnd', '{"code": "dnd", "label": "Не беспокоить", "icon": "🔕", "synonyms": ["не беспокоить", "никого не пускай", "никого не пускать"]}'::jsonb),
    ('guest', '{"code": "guest", "label": "Пригласи гостя", "icon": "🤝", "synonyms": ["пригласи гостя", "гостя в кабинет", "пусть гость заходит", "пусть заходит"]}'::jsonb)
),
missing as (
  select c.id, jsonb_agg(f.action order by f.code) as rows
    from companies c
    cross join fresh f
   where jsonb_typeof(c.settings #> '{secretary,actions}') = 'array'
     and not exists (
       select 1
         from jsonb_array_elements(c.settings #> '{secretary,actions}') a
        where a->>'code' = f.code
     )
   group by c.id
)
update companies c
   set settings = jsonb_set(c.settings, '{secretary,actions}', (c.settings #> '{secretary,actions}') || m.rows)
  from missing m
 where m.id = c.id
   and jsonb_array_length(c.settings #> '{secretary,actions}') + jsonb_array_length(m.rows) <= 12;
