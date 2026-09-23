-- D-99, доводка: «на месте / не на месте до …» секретаря должно доходить до стола директора и
-- до других экранов без перезагрузки. Профили не были в публикации Realtime — клиент читал
-- их раз в полминуты. Добавляем таблицу в публикацию; клиент слушает только строки
-- секретарей (фильтр `role=eq.secretary`), RLS profiles_select оставляет каждому свою
-- компанию. Схема и политики не меняются.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table profiles;
  end if;
end
$$;
