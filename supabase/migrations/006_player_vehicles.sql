-- Cars bought from a city car lot. Keyed by wallet so a car and its lock
-- survive a refresh, a reconnect and a server restart. The vehicles that seed
-- the world are not stored here - they are world furniture, not property.
-- Safe to re-run.

create table if not exists public.player_vehicles (
  id text primary key,
  owner_wallet text not null,
  owner_chain public.wallet_chain not null,
  city public.city_id not null default 'trench',
  kind text not null,
  color text not null,
  -- Where it was last parked, so it is waiting where you left it.
  x double precision not null default 0,
  z double precision not null default 0,
  rot_y double precision not null default 0,
  locked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_vehicles_owner_idx
  on public.player_vehicles (owner_wallet, owner_chain);

-- Same posture as the other tables: the anon key ships in the frontend bundle,
-- so deny it outright. Only the server (service role, BYPASSRLS) writes here.
alter table public.player_vehicles enable row level security;
revoke all on public.player_vehicles from anon, authenticated;
