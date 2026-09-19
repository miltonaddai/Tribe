-- The in-game currency is called Tribute, not credits.
-- Renaming preserves every existing balance; adding a column would not.
-- Safe to re-run.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'characters' and column_name = 'credits'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'characters' and column_name = 'tribute'
  ) then
    alter table public.characters rename column credits to tribute;
  end if;
end $$;

-- For a database that never had the old column at all.
alter table public.characters
  add column if not exists tribute numeric(12, 2) not null default 500;
