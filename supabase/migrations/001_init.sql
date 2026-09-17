-- Tribe — initial schema
-- Run in order from supabase/migrations/. Paste into Supabase SQL Editor if needed.
-- Backend uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.

create extension if not exists pgcrypto;

do $$ begin
  create type public.wallet_chain as enum ('solana-testnet', 'robinhood-testnet');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.city_id as enum ('trench', 'gas', 'realworld', 'valhalla');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.asset_kind as enum ('outfit', 'headwear', 'accessory', 'vehicle', 'avatar', 'other');
exception when duplicate_object then null;
end $$;

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  chain public.wallet_chain not null,
  symbol text not null check (symbol in ('SOL', 'ETH')),
  last_balance numeric(20, 8) not null default 0,
  last_city public.city_id not null default 'trench',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (address, chain)
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references public.wallets (id) on delete set null,
  wallet_address text not null,
  chain public.wallet_chain not null,
  display_name text not null default 'trenchrat',
  body_type text not null default 'regular',
  skin_tone text not null default '#F6D7B0',
  outfit text not null default 'hi-vis',
  headwear text not null default 'hardhat',
  accessories text[] not null default '{}',
  home_city public.city_id not null default 'trench',
  access_tier smallint not null default 1,
  brokemeter numeric(8, 2) not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wallet_address, chain)
);

create table if not exists public.player_settings (
  wallet_address text not null,
  chain public.wallet_chain not null,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (wallet_address, chain)
);

create table if not exists public.presence (
  session_id text primary key,
  wallet text not null default '',
  city public.city_id not null default 'trench',
  character_id uuid references public.characters (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_assets (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  kind public.asset_kind not null,
  name text not null,
  city_tier smallint not null default 1,
  r2_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  chain public.wallet_chain not null,
  character_id uuid references public.characters (id) on delete cascade,
  asset_id uuid not null references public.game_assets (id) on delete cascade,
  acquired_at timestamptz not null default now(),
  unique (character_id, asset_id)
);

create index if not exists wallets_address_idx on public.wallets (address);
create index if not exists characters_wallet_idx on public.characters (wallet_address, chain);
create index if not exists presence_wallet_idx on public.presence (wallet);
create index if not exists inventory_wallet_idx on public.inventory (wallet_address, chain);
create index if not exists game_assets_kind_idx on public.game_assets (kind);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists characters_updated_at on public.characters;
create trigger characters_updated_at
  before update on public.characters
  for each row execute procedure public.set_updated_at();

drop trigger if exists player_settings_updated_at on public.player_settings;
create trigger player_settings_updated_at
  before update on public.player_settings
  for each row execute procedure public.set_updated_at();

alter table public.wallets enable row level security;
alter table public.characters enable row level security;
alter table public.player_settings enable row level security;
alter table public.presence enable row level security;
alter table public.game_assets enable row level security;
alter table public.inventory enable row level security;

drop policy if exists game_assets_public_read on public.game_assets;
create policy game_assets_public_read
  on public.game_assets
  for select
  using (true);

insert into public.game_assets (key, kind, name, city_tier, r2_key) values
  ('outfit.hi-vis', 'outfit', 'Hi-Vis Work Jacket', 1, 'clothing/hi-vis.png'),
  ('outfit.hoodie', 'outfit', 'Street Hoodie', 1, 'clothing/hoodie.png'),
  ('outfit.suit', 'outfit', 'Suit & Tie', 3, 'clothing/suit.png'),
  ('outfit.neon', 'outfit', 'Neon Runner', 3, 'clothing/neon.png'),
  ('outfit.gold', 'outfit', 'Valhalla Gold', 4, 'clothing/gold.png'),
  ('outfit.puffer', 'outfit', 'Puffer Jacket', 2, 'clothing/puffer.png'),
  ('outfit.jersey', 'outfit', 'Block Jersey', 2, 'clothing/jersey.png'),
  ('outfit.trench-coat', 'outfit', 'Trench Coat', 1, 'clothing/trench-coat.png'),
  ('outfit.overalls', 'outfit', 'Work Overalls', 1, 'clothing/overalls.png'),
  ('headwear.hardhat', 'headwear', 'Hard Hat', 1, 'clothing/hardhat.png'),
  ('headwear.beanie', 'headwear', 'Beanie', 1, 'clothing/beanie.png'),
  ('headwear.cap', 'headwear', 'Cap', 1, 'clothing/cap.png'),
  ('headwear.none', 'headwear', 'None', 1, null),
  ('headwear.crown', 'headwear', 'Crown', 4, 'clothing/crown.png'),
  ('accessory.glasses', 'accessory', 'Glasses', 1, 'clothing/glasses.png'),
  ('accessory.chain', 'accessory', 'Gold Chain', 2, 'clothing/chain.png'),
  ('accessory.backpack', 'accessory', 'Backpack', 1, 'clothing/backpack.png'),
  ('accessory.earbuds', 'accessory', 'Earbuds', 2, 'clothing/earbuds.png'),
  ('accessory.watch', 'accessory', 'Watch', 3, 'clothing/watch.png'),
  ('vehicle.beater', 'vehicle', 'Beater', 1, 'cars/beater.png'),
  ('vehicle.work-van', 'vehicle', 'Work Van', 2, 'cars/work-van.png'),
  ('vehicle.neon-runner', 'vehicle', 'Neon Runner', 3, 'cars/neon-runner.png'),
  ('vehicle.gold-lambo', 'vehicle', 'Gold Lambo', 4, 'cars/gold-lambo.png')
on conflict (key) do nothing;
