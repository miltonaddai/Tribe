-- Tribe is now Moonville, the token is $MOON, and the districts are renamed:
-- trench -> trenches, gas -> bagtown, realworld -> midtown, valhalla -> uptown.
--
-- THIS WIPES ALL PLAYER GAME DATA: characters, homes, cars, inventory, friends,
-- messages, crime reports, settings and payment receipts. That was agreed
-- because there are no real players yet, and it is simpler than translating
-- every stored id - home ids embed the district name ("trench-home-3-4") and
-- crime reports store it as plain text.
--
-- Kept: accounts (usernames, passwords, linked wallets) and the game_assets
-- catalogue. Players who sign in again simply create a new character.
--
-- Run after 017. Safe to re-run.

truncate table
  public.characters,
  public.wallets,
  public.player_settings,
  public.presence,
  public.inventory,
  public.home_auctions,
  public.player_vehicles,
  public.token_payments,
  public.friendships,
  public.player_messages,
  public.crime_reports
  restart identity cascade;

-- District ids. RENAME VALUE rewrites the label in place, so every city_id
-- column and column default follows without touching any rows.
do $$
declare
  pair text[];
begin
  foreach pair slice 1 in array array[
    ['trench', 'trenches'],
    ['gas', 'bagtown'],
    ['realworld', 'midtown'],
    ['valhalla', 'uptown']
  ] loop
    if exists (
      select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'city_id' and e.enumlabel = pair[1]
    ) then
      execute format('alter type public.city_id rename value %L to %L', pair[1], pair[2]);
    end if;
  end loop;
end $$;

-- The in-game balance column, named after the old currency.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'characters' and column_name = 'tribute'
  ) then
    alter table public.characters rename column tribute to moon;
  end if;
end $$;

-- The only symbol stored now. The table was emptied above, so nothing violates it.
alter table public.wallets drop constraint if exists wallets_symbol_check;
alter table public.wallets add constraint wallets_symbol_check check (symbol in ('MOON'));
